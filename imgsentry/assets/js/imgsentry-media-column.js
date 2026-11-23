/**
 * ImgSentry - Media Library column.
 *
 * Handles the Optimize, Re-optimize, Restore original and Details buttons in the
 * Media Library list view. The server returns the finished cell HTML, which replaces the old cell.
 */
( function () {
	'use strict';

	var cfg = window.imgsentryMediaColumn;
	if ( ! cfg || ! cfg.ajaxUrl ) {
		return;
	}
	var i18n = cfg.i18n || {};

	function setBusy( cell, busy, text ) {
		var old = cell.querySelector( '.imgsentry-ml__busy' );
		if ( old ) {
			old.parentNode.removeChild( old );
		}

		var controls = cell.querySelectorAll( 'button' );
		for ( var i = 0; i < controls.length; i++ ) {
			controls[ i ].disabled = !! busy;
		}

		if ( ! busy ) {
			cell.removeAttribute( 'data-busy' );
			cell.classList.remove( 'is-busy' );
			return;
		}

		cell.setAttribute( 'data-busy', '1' );
		cell.classList.add( 'is-busy' );

		var wrap = document.createElement( 'div' );
		wrap.className = 'imgsentry-ml__busy';
		wrap.setAttribute( 'role', 'status' );

		var spinner = document.createElement( 'span' );
		spinner.className = 'imgsentry-ml__spinner';
		spinner.setAttribute( 'aria-hidden', 'true' );

		var label = document.createElement( 'span' );
		label.textContent = text || '';

		wrap.appendChild( spinner );
		wrap.appendChild( label );
		cell.insertBefore( wrap, cell.firstChild );
	}

	function showNotice( cell, type, text ) {
		var old = cell.querySelector( '.imgsentry-ml__notice' );
		if ( old ) {
			old.parentNode.removeChild( old );
		}
		var p = document.createElement( 'p' );
		p.className = 'imgsentry-ml__notice imgsentry-ml__notice--' + ( 'success' === type ? 'success' : 'error' );
		p.setAttribute( 'role', 'success' === type ? 'status' : 'alert' );
		p.textContent = text;
		cell.insertBefore( p, cell.firstChild );
	}

	function autoHideNotice( cell ) {
		var notice = cell.querySelector( '.imgsentry-ml__notice--success' );
		if ( ! notice ) {
			return;
		}
		window.setTimeout( function () {
			if ( notice.parentNode ) {
				notice.parentNode.removeChild( notice );
			}
		}, 6000 );
	}

	function replaceCell( cell, html ) {
		var holder = document.createElement( 'div' );
		holder.innerHTML = html; // HTML is built and escaped by the plugin on the server.
		var fresh = holder.firstElementChild;
		if ( ! fresh || ! cell.parentNode ) {
			setBusy( cell, false );
			return;
		}
		cell.parentNode.replaceChild( fresh, cell );
		autoHideNotice( fresh );
	}

	function send( cell, action, extra, busyText ) {
		if ( '1' === cell.getAttribute( 'data-busy' ) ) {
			return;
		}

		var body = new FormData();
		body.append( 'action', action );
		body.append( 'nonce', cfg.nonce );
		body.append( 'attachment_id', cell.getAttribute( 'data-imgsentry-id' ) );
		if ( extra ) {
			Object.keys( extra ).forEach( function ( key ) {
				body.append( key, extra[ key ] );
			} );
		}

		setBusy( cell, true, busyText );

		window.fetch( cfg.ajaxUrl, { method: 'POST', body: body, credentials: 'same-origin' } )
			.then( function ( response ) {
				return response.json();
			} )
			.then( function ( res ) {
				var data = res && res.data ? res.data : {};
				if ( data.html ) {
					replaceCell( cell, data.html );
					return;
				}
				setBusy( cell, false );
				showNotice( cell, 'error', data.message || i18n.failed );
			} )
			.catch( function () {
				setBusy( cell, false );
				showNotice( cell, 'error', i18n.failed );
			} );
	}

	function toggleDetails( cell, button ) {
		var panel = cell.querySelector( '.imgsentry-ml__panel' );
		if ( ! panel ) {
			return;
		}
		var open = panel.hasAttribute( 'hidden' );
		if ( open ) {
			panel.removeAttribute( 'hidden' );
		} else {
			panel.setAttribute( 'hidden', '' );
		}
		button.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		var label = button.querySelector( '.imgsentry-ml__toggle-text' ) || button;
		label.textContent = open ? ( i18n.showLess || 'Close Details' ) : ( i18n.showMore || 'View Details' );
	}

	document.addEventListener( 'click', function ( event ) {
		var target = event.target;
		var button = target && target.closest ? target.closest( '[data-imgsentry-action]' ) : null;
		if ( ! button ) {
			return;
		}
		var cell = button.closest( '.imgsentry-ml' );
		if ( ! cell ) {
			return;
		}

		var action = button.getAttribute( 'data-imgsentry-action' );

		if ( 'toggle' === action ) {
			event.preventDefault();
			toggleDetails( cell, button );
		} else if ( 'optimize' === action ) {
			event.preventDefault();
			send( cell, 'imgsentry_ml_optimize', { force: '0' }, i18n.optimizing );
		} else if ( 'reoptimize' === action || 'retry' === action ) {
			event.preventDefault();
			send( cell, 'imgsentry_ml_optimize', { force: '1' }, i18n.optimizing );
		} else if ( 'delete-nextgen' === action ) {
			event.preventDefault();
			if ( window.confirm( i18n.confirmNextgen || 'Delete the WebP and AVIF copies of this image?' ) ) {
				send( cell, 'imgsentry_ml_delete_nextgen', null, i18n.deleting );
			}
		} else if ( 'restore' === action ) {
			event.preventDefault();
			send( cell, 'imgsentry_ml_restore', null, i18n.restoring );
		}
	} );
}() );
