<?php
/**
 * Live progress of a single image optimization.
 *
 * The optimizer writes small progress records while it works and the browser polls them
 * (AJAX action imgsentry_get_optimize_progress). Records live in short transients, so nothing
 * stays in the database for long. Writing progress must never break an optimization: every
 * public method swallows its own errors.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Optimize_Progress {

	const KEY_PREFIX   = 'imgsentry_oprog_';
	const ACTIVE_KEY   = 'imgsentry_oprog_active';
	const TTL_RUNNING  = 300; // Seconds a running record is kept.
	const TTL_FINISHED = 60;  // Seconds a finished record is kept.
	const STALE_AFTER  = 120; // A running record not updated for this long is reported as "stale".
	const ACTIVE_MAX   = 180; // A record not updated for this long is dropped from the active list.
	const STEPS_TOTAL  = 4;
	const LOCK_TTL     = 120; // Seconds the per-attachment optimization lock is renewed to.

	/**
	 * When the optimization lock of an attachment was last renewed by this request.
	 *
	 * @var array<int,int>
	 */
	private static $lock_renewed = array();

	/**
	 * Transient key for one attachment.
	 *
	 * @param int $id Attachment ID.
	 * @return string
	 */
	private static function key( $id ) {
		return self::KEY_PREFIX . (int) $id;
	}

	/**
	 * Begin tracking an optimization.
	 *
	 * @param int $id Attachment ID.
	 * @return void
	 */
	public static function start( $id ) {
		try {
			$id  = (int) $id;
			$now = time();
			set_transient(
				self::key( $id ),
				array(
					'attachment_id' => $id,
					'state'         => 'running',
					'percent'       => 0,
					'step'          => 1,
					'steps_total'   => self::STEPS_TOTAL,
					'label'         => __( 'Preparing and backing up', 'imgsentry' ),
					'current'       => 0,
					'total'         => 0,
					'message'       => '',
					'started_at'    => $now,
					'updated_at'    => $now,
				),
				self::TTL_RUNNING
			);
			$active        = self::read_active();
			$active[ $id ] = $now;
			set_transient( self::ACTIVE_KEY, $active, self::TTL_RUNNING );
		} catch ( Throwable $e ) {
			unset( $e ); // Progress is optional; never stop the optimization.
		}
	}

	/**
	 * Record progress. The percentage never goes down and stays below 100 until finish().
	 *
	 * @param int    $id       Attachment ID.
	 * @param int    $percent  0-99.
	 * @param int    $step     1-4.
	 * @param string $label    Short text for the person.
	 * @param int    $current  Done items of this step (optional).
	 * @param int    $total    Total items of this step (optional).
	 * @param int    $lock_ttl Seconds the optimization lock is renewed to (default 120).
	 * @return void
	 */
	public static function update( $id, $percent, $step, $label, $current = 0, $total = 0, $lock_ttl = self::LOCK_TTL ) {
		try {
			$id   = (int) $id;
			$data = get_transient( self::key( $id ) );

			// Heartbeat: a long optimization must not lose its lock while it is still working.
			$now = time();
			if ( ! isset( self::$lock_renewed[ $id ] ) || $now - self::$lock_renewed[ $id ] >= 15 || (int) $lock_ttl > self::LOCK_TTL ) {
				set_transient( 'imgsentry_opt_lock_' . $id, $now, max( 1, (int) $lock_ttl ) );
				self::$lock_renewed[ $id ] = $now;
			}

			if ( ! is_array( $data ) || 'running' !== $data['state'] ) {
				return;
			}

			$percent = max( (int) $data['percent'], min( 99, max( 0, (int) round( $percent ) ) ) );
			$step    = max( 1, min( self::STEPS_TOTAL, (int) $step ) );
			$label   = (string) $label;
			$current = max( 0, (int) $current );
			$total   = max( 0, (int) $total );

			if ( $percent === (int) $data['percent'] && $step === (int) $data['step'] && $label === (string) $data['label'] && $current === (int) $data['current'] && $total === (int) $data['total'] ) {
				return; // Nothing new: save a database write.
			}

			$data['percent']    = $percent;
			$data['step']       = $step;
			$data['label']      = $label;
			$data['current']    = $current;
			$data['total']      = $total;
			$data['updated_at'] = $now;
			set_transient( self::key( $id ), $data, self::TTL_RUNNING );
		} catch ( Throwable $e ) {
			unset( $e );
		}
	}

	/**
	 * End tracking. Only a running record is finished; anything else is left as it is.
	 *
	 * @param int    $id      Attachment ID.
	 * @param string $state   'done' or 'failed'.
	 * @param string $message Failure text (optional).
	 * @return void
	 */
	public static function finish( $id, $state, $message = '' ) {
		try {
			$id   = (int) $id;
			$data = get_transient( self::key( $id ) );
			unset( self::$lock_renewed[ $id ] );
			if ( ! is_array( $data ) || 'running' !== $data['state'] ) {
				return;
			}
			$done                = ( 'done' === $state );
			$data['state']       = $done ? 'done' : 'failed';
			$data['percent']     = $done ? 100 : (int) $data['percent'];
			$data['step']        = $done ? self::STEPS_TOTAL : (int) $data['step'];
			$data['message']     = $done ? '' : self::clean_message( $message );
			$data['updated_at']  = time();
			set_transient( self::key( $id ), $data, self::TTL_FINISHED );

			$active = self::read_active();
			if ( isset( $active[ $id ] ) ) {
				unset( $active[ $id ] );
				set_transient( self::ACTIVE_KEY, $active, self::TTL_RUNNING );
			}
		} catch ( Throwable $e ) {
			unset( $e );
		}
	}

	/**
	 * Forget a record without showing a result (the optimization did not run, for example "already optimized").
	 *
	 * @param int $id Attachment ID.
	 * @return void
	 */
	public static function discard( $id ) {
		try {
			$id = (int) $id;
			delete_transient( self::key( $id ) );
			unset( self::$lock_renewed[ $id ] );
			$active = self::read_active();
			if ( isset( $active[ $id ] ) ) {
				unset( $active[ $id ] );
				set_transient( self::ACTIVE_KEY, $active, self::TTL_RUNNING );
			}
		} catch ( Throwable $e ) {
			unset( $e );
		}
	}

	/**
	 * Progress of one attachment in the documented shape.
	 *
	 * @param int $id Attachment ID.
	 * @return array
	 */
	public static function get( $id ) {
		$id   = (int) $id;
		$data = get_transient( self::key( $id ) );
		if ( ! is_array( $data ) ) {
			return array(
				'attachment_id' => $id,
				'state'         => 'none',
				'percent'       => 0,
				'step'          => 0,
				'steps_total'   => self::STEPS_TOTAL,
				'label'         => '',
				'current'       => 0,
				'total'         => 0,
				'message'       => '',
				'started_at'    => 0,
				'updated_at'    => 0,
			);
		}
		$state = (string) $data['state'];
		if ( 'running' === $state && time() - (int) $data['updated_at'] > self::STALE_AFTER ) {
			$state = 'stale';
		}
		return array(
			'attachment_id' => $id,
			'state'         => $state,
			'percent'       => (int) $data['percent'],
			'step'          => (int) $data['step'],
			'steps_total'   => (int) $data['steps_total'],
			'label'         => (string) $data['label'],
			'current'       => (int) $data['current'],
			'total'         => (int) $data['total'],
			'message'       => (string) $data['message'],
			'started_at'    => (int) $data['started_at'],
			'updated_at'    => (int) $data['updated_at'],
		);
	}

	/**
	 * Progress of several attachments, keyed by attachment ID.
	 *
	 * @param int[] $ids Attachment IDs.
	 * @return array<int,array>
	 */
	public static function get_many( array $ids ) {
		$out = array();
		foreach ( array_unique( array_map( 'intval', $ids ) ) as $id ) {
			if ( $id > 0 ) {
				$out[ $id ] = self::get( $id );
			}
		}
		return $out;
	}

	/**
	 * IDs that are being optimized right now. Records that disappeared or were not updated for ACTIVE_MAX seconds are dropped.
	 *
	 * @return int[]
	 */
	public static function get_active() {
		$active = self::read_active();
		$now    = time();
		$keep   = array();
		foreach ( $active as $id => $started ) {
			$data = get_transient( self::key( (int) $id ) );
			if ( is_array( $data ) && 'running' === $data['state'] && $now - (int) $data['updated_at'] <= self::ACTIVE_MAX ) {
				$keep[ (int) $id ] = (int) $started;
			}
		}
		if ( count( $keep ) !== count( $active ) ) {
			set_transient( self::ACTIVE_KEY, $keep, self::TTL_RUNNING );
		}
		return array_keys( $keep );
	}

	/**
	 * The stored list of active IDs (id => started_at).
	 *
	 * @return array<int,int>
	 */
	private static function read_active() {
		$active = get_transient( self::ACTIVE_KEY );
		return is_array( $active ) ? $active : array();
	}

	/**
	 * Failure text safe to show: no tags, no line breaks, limited length.
	 *
	 * @param string $message Raw text.
	 * @return string
	 */
	private static function clean_message( $message ) {
		$message = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $message ) ) );
		return function_exists( 'mb_substr' ) ? mb_substr( $message, 0, 300 ) : substr( $message, 0, 300 );
	}
}
