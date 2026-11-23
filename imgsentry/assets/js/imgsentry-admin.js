/**
 * ImgSentry Admin JavaScript
 *
 * @package Media_Cleanup_Manager
 */

/**
 * Global Custom Dark Confirmation Modal Helper (Mockup Replica)
 */
window.imgsentryShowConfirmModal = function (options) {
	options = options || {};
	var title = options.title || 'Delete item permanently?';
	var description = options.description || "This file will be permanently removed. This action can't be undone.";
	var confirmText = options.confirmText || 'Delete permanently';
	var cancelText = options.cancelText || 'Cancel';
	var onConfirm = options.onConfirm;

	var svgIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#e05d43" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
		'<line x1="12" y1="9" x2="12" y2="13"></line>' +
		'<line x1="12" y1="17" x2="12.01" y2="17"></line>' +
		'</svg>';

	// Clean up existing backdrops regardless of library availability
	var existingBackdrops = document.querySelectorAll('.imgsentry-fm-confirm-backdrop');
	for (var i = 0; i < existingBackdrops.length; i++) {
		if (existingBackdrops[i].parentNode) {
			existingBackdrops[i].parentNode.removeChild(existingBackdrops[i]);
		}
	}

	if (typeof jQuery !== 'undefined') {
		var $ = jQuery;
		var $backdrop = $(
			'<div class="imgsentry-fm-confirm-backdrop">' +
				'<div class="imgsentry-fm-confirm-card">' +
					'<div class="imgsentry-fm-confirm-content">' +
						'<div class="imgsentry-fm-confirm-icon-badge">' + svgIcon + '</div>' +
						'<div class="imgsentry-fm-confirm-text-group">' +
							'<h4 class="imgsentry-fm-confirm-title">' + title + '</h4>' +
							'<p class="imgsentry-fm-confirm-desc">' + description + '</p>' +
						'</div>' +
					'</div>' +
					'<div class="imgsentry-fm-confirm-actions">' +
						'<button type="button" class="imgsentry-fm-confirm-btn-cancel">' + cancelText + '</button>' +
						'<button type="button" class="imgsentry-fm-confirm-btn-destructive">' + confirmText + '</button>' +
					'</div>' +
				'</div>' +
			'</div>'
		);

		$('body').append($backdrop);

		var closeModal = function () {
			$(document).off('keydown.fmconfirmmodal');
			$backdrop.fadeOut(120, function () { $(this).remove(); });
		};

		$backdrop.find('.imgsentry-fm-confirm-btn-cancel').on('click', closeModal);

		$backdrop.on('click', function (e) {
			if ($(e.target).hasClass('imgsentry-fm-confirm-backdrop')) {
				closeModal();
			}
		});

		$(document).off('keydown.fmconfirmmodal').on('keydown.fmconfirmmodal', function (e) {
			if (e.key === 'Escape' || e.which === 27) {
				closeModal();
			}
		});

		$backdrop.find('.imgsentry-fm-confirm-btn-destructive').on('click', function () {
			var $btn = $(this);
			if (typeof onConfirm === 'function') {
				onConfirm($backdrop, closeModal, $btn);
			} else {
				closeModal();
			}
		});

		return $backdrop;
	} else {
		// Pure Vanilla JS Fallback when jQuery is unavailable
		var tempDiv = document.createElement('div');
		tempDiv.innerHTML = (
			'<div class="imgsentry-fm-confirm-backdrop">' +
				'<div class="imgsentry-fm-confirm-card">' +
					'<div class="imgsentry-fm-confirm-content">' +
						'<div class="imgsentry-fm-confirm-icon-badge">' + svgIcon + '</div>' +
						'<div class="imgsentry-fm-confirm-text-group">' +
							'<h4 class="imgsentry-fm-confirm-title">' + title + '</h4>' +
							'<p class="imgsentry-fm-confirm-desc">' + description + '</p>' +
						'</div>' +
					'</div>' +
					'<div class="imgsentry-fm-confirm-actions">' +
						'<button type="button" class="imgsentry-fm-confirm-btn-cancel">' + cancelText + '</button>' +
						'<button type="button" class="imgsentry-fm-confirm-btn-destructive">' + confirmText + '</button>' +
					'</div>' +
				'</div>' +
			'</div>'
		).trim();

		var backdropEl = tempDiv.firstChild;
		document.body.appendChild(backdropEl);

		var keydownHandler = function (e) {
			if (e.key === 'Escape' || e.keyCode === 27) {
				closeVanillaModal();
			}
		};

		var closeVanillaModal = function () {
			document.removeEventListener('keydown', keydownHandler);
			if (backdropEl && backdropEl.parentNode) {
				backdropEl.parentNode.removeChild(backdropEl);
			}
		};

		var cancelBtn = backdropEl.querySelector('.imgsentry-fm-confirm-btn-cancel');
		if (cancelBtn) {
			cancelBtn.addEventListener('click', closeVanillaModal);
		}

		backdropEl.addEventListener('click', function (e) {
			if (e.target === backdropEl) {
				closeVanillaModal();
			}
		});

		document.addEventListener('keydown', keydownHandler);

		var confirmBtn = backdropEl.querySelector('.imgsentry-fm-confirm-btn-destructive');
		if (confirmBtn) {
			confirmBtn.addEventListener('click', function () {
				if (typeof onConfirm === 'function') {
					onConfirm(backdropEl, closeVanillaModal, confirmBtn);
				} else {
					closeVanillaModal();
				}
			});
		}

		return backdropEl;
	}
};

jQuery(document).ready(function ($) {
	'use strict';

	// State variables
	var state = {
		status: 'active',
		type: 'all',
		search: '',
		dateFrom: '',
		dateTo: '',
		page: 1,
		view: 'grid',
		selectedIds: []
	};

	// DOM Cache
	var $container = $('#imgsentry-media-container');
	var $paginationInfo = $('#imgsentry-pagination-info');
	var $paginationLinks = $('#imgsentry-pagination-links');

	/**
	 * Initialize plugin UI events.
	 */
	function init() {
		loadMedia();

		// Tab switching
		$('.imgsentry-nav-tabs .nav-tab').on('click', function (e) {
			e.preventDefault();
			$('.imgsentry-nav-tabs .nav-tab').removeClass('nav-tab-active');
			$(this).addClass('nav-tab-active');

			var targetStatus = $(this).data('status');
			state.status = targetStatus;
			state.page = 1;
			state.selectedIds = [];
			$('#imgsentry-select-all').prop('checked', false);

			if (targetStatus === 'settings') {
				$('#imgsentry-tab-content-media').hide();
				$('#imgsentry-tab-content-settings').show();
			} else {
				$('#imgsentry-tab-content-settings').hide();
				$('#imgsentry-tab-content-media').show();

				// Toggle toolbar buttons based on tab
				if (targetStatus === 'trash') {
					$('#imgsentry-btn-delete-all').hide();
					$('#imgsentry-btn-empty-trash').show();
					$('.imgsentry-opt-active-only').hide();
					$('.imgsentry-opt-trash-only').show();
				} else {
					$('#imgsentry-btn-delete-all').show();
					$('#imgsentry-btn-empty-trash').hide();
					$('.imgsentry-opt-active-only').show();
					$('.imgsentry-opt-trash-only').hide();
				}

				loadMedia();
			}
		});

		// View mode toggle
		$('.imgsentry-view-btn').on('click', function () {
			$('.imgsentry-view-btn').removeClass('active');
			$(this).addClass('active');
			state.view = $(this).data('view');
			if (state.view === 'list') {
				$container.removeClass('imgsentry-grid-view').addClass('imgsentry-list-view');
			} else {
				$container.removeClass('imgsentry-list-view').addClass('imgsentry-grid-view');
			}
		});

		// Filter button
		$('#imgsentry-btn-filter').on('click', function () {
			state.type = $('#imgsentry-filter-type').val();
			state.search = $('#imgsentry-search-input').val();
			state.dateFrom = $('#imgsentry-date-from').val();
			state.dateTo = $('#imgsentry-date-to').val();
			state.page = 1;
			loadMedia();
		});

		// Reset Filter button
		$('#imgsentry-btn-reset-filter').on('click', function () {
			$('#imgsentry-filter-type').val('all');
			$('#imgsentry-search-input').val('');
			$('#imgsentry-date-from').val('');
			$('#imgsentry-date-to').val('');
			state.type = 'all';
			state.search = '';
			state.dateFrom = '';
			state.dateTo = '';
			state.page = 1;
			loadMedia();
		});

		// Select All Checkbox
		$('#imgsentry-select-all').on('change', function () {
			var isChecked = $(this).is(':checked');
			$('.imgsentry-item-checkbox').prop('checked', isChecked);
			updateSelectedIds();
		});

		// Individual Item Checkbox
		$container.on('change', '.imgsentry-item-checkbox', function () {
			updateSelectedIds();
		});

		// Bulk Apply Action
		$('#imgsentry-btn-apply-bulk').on('click', function () {
			var action = $('#imgsentry-bulk-action').val();
			if (!action) {
				showToast('Please select a bulk action.', 'error');
				return;
			}
			if (state.selectedIds.length === 0) {
				showToast(imgsentry_data.i18n.select_items, 'error');
				return;
			}

			if (action === 'delete_permanent') {
				var count = state.selectedIds.length;
				var title = count === 1 ? 'Delete selected file permanently?' : 'Delete ' + count + ' items permanently?';
				var desc = count === 1 ? 'This file will be permanently removed. This action can\'t be undone.' : 'These ' + count + ' files will be permanently removed. This action can\'t be undone.';

				window.imgsentryShowConfirmModal({
					title: title,
					description: desc,
					confirmText: 'Delete permanently',
					onConfirm: function ($modal, closeModal) {
						closeModal();
						performBulkAction(action, state.selectedIds);
					}
				});
				return;
			}

			performBulkAction(action, state.selectedIds);
		});

		// Single Item Move to Trash / Restore / Delete
		$container.on('click', '.imgsentry-action-trash', function () {
			var id = $(this).data('id');
			performAction('imgsentry_move_to_trash', { id: id });
		});

		$container.on('click', '.imgsentry-action-restore', function () {
			var id = $(this).data('id');
			performAction('imgsentry_restore_media', { id: id });
		});

		$container.on('click', '.imgsentry-action-delete', function () {
			var id = $(this).data('id');
			var $card = $(this).closest('.imgsentry-media-card, .imgsentry-media-row, tr, .imgsentry-item');
			var filename = $card.find('.imgsentry-media-title, .imgsentry-filename, h4').text().trim() || 'this file';

			window.imgsentryShowConfirmModal({
				title: 'Delete "' + filename + '" permanently?',
				description: 'This file will be permanently removed. This action can\'t be undone.',
				confirmText: 'Delete permanently',
				onConfirm: function ($modal, closeModal) {
					closeModal();
					performAction('imgsentry_delete_permanently', { id: id });
				}
			});
		});

		// Delete All Modal triggers
		$('#imgsentry-btn-delete-all').on('click', function () {
			$('#imgsentry-modal-delete-all').addClass('active').show();
			$('#imgsentry-confirm-delete-input').val('');
		});

		// Scan Button Trigger -> Opens Safety Checklist Modal
		$('#imgsentry-btn-scan').on('click', function () {
			$('#imgsentry-safety-modal').addClass('active').show();
			$('#imgsentry-chk-backup, #imgsentry-chk-responsibility').prop('checked', false);
			$('#imgsentry-btn-understand').prop('disabled', true);
		});

		// Safety Checkboxes change listener
		$('#imgsentry-chk-backup, #imgsentry-chk-responsibility').on('change', function () {
			var bothChecked = $('#imgsentry-chk-backup').is(':checked') && $('#imgsentry-chk-responsibility').is(':checked');
			$('#imgsentry-btn-understand').prop('disabled', !bothChecked);
		});

		// Click "I Understand" -> Executes Scan
		$('#imgsentry-btn-understand').on('click', function () {
			$('#imgsentry-safety-modal').removeClass('active').hide();
			showToast('Scanning media library for unused files...', 'success');
			loadMedia();
		});

		$('.imgsentry-modal-close').on('click', function () {
			$('.imgsentry-modal, #imgsentry-safety-modal, .imgsentry-modal-overlay').removeClass('active').hide();
		});

		// Confirm Delete All Button
		$('#imgsentry-btn-confirm-delete-all').on('click', function () {
			var confirmText = $('#imgsentry-confirm-delete-input').val().trim();
			var targetType = $('input[name="imgsentry_delete_all_target"]:checked').val();

			if (confirmText !== 'DELETE') {
				showToast(imgsentry_data.i18n.type_delete_error, 'error');
				return;
			}

			var data = {
				action: 'imgsentry_delete_all',
				nonce: imgsentry_data.nonce,
				confirm_text: confirmText,
				target_type: targetType,
				status_scope: state.status
			};

			showLoading();
			$.post(imgsentry_data.ajax_url, data, function (response) {
				$('.imgsentry-modal').removeClass('active');
				if (response.success) {
					showToast(response.data.message, 'success');
					updateStats(response.data.stats);
					state.page = 1;
					loadMedia();
				} else {
					showToast(response.data.message || 'An error occurred.', 'error');
				}
			});
		});

		// Empty Trash Button
		$('#imgsentry-btn-empty-trash').on('click', function () {
			var count = state.selectedIds.length || $('.imgsentry-item-checkbox').length || 0;
			var title = count > 0 ? 'Empty Trash Bin permanently?' : 'Empty Trash Bin permanently?';
			var desc = 'All items in the trash bin will be permanently removed. This action can\'t be undone.';

			window.imgsentryShowConfirmModal({
				title: title,
				description: desc,
				confirmText: 'Delete permanently',
				onConfirm: function ($modal, closeModal) {
					closeModal();
					performAction('imgsentry_empty_trash', {});
				}
			});
		});

		// Save Settings Form
		$('#imgsentry-settings-form').on('submit', function (e) {
			e.preventDefault();
			var days = $('#imgsentry_trash_days_input').val();

			var data = {
				action: 'imgsentry_save_settings',
				nonce: imgsentry_data.nonce,
				trash_days: days
			};

			$.post(imgsentry_data.ajax_url, data, function (response) {
				if (response.success) {
					showToast(response.data.message, 'success');
				} else {
					showToast(response.data.message || 'Error saving settings', 'error');
				}
			});
		});

		// Run Cron Now Button
		$('#imgsentry-btn-run-cron-now').on('click', function () {
			var data = {
				action: 'imgsentry_run_cron_now',
				nonce: imgsentry_data.nonce
			};

			$(this).prop('disabled', true).text(imgsentry_data.i18n.processing);

			$.post(imgsentry_data.ajax_url, data, function (response) {
				$('#imgsentry-btn-run-cron-now').prop('disabled', false).html('<span class="dashicons dashicons-clock"></span> Run Auto-Purge Cron Now');
				if (response.success) {
					showToast(response.data.message, 'success');
					updateStats(response.data.stats);
					if (state.status === 'trash') {
						loadMedia();
					}
				} else {
					showToast(response.data.message || 'Error running cron.', 'error');
				}
			});
		});
	}

	/**
	 * Update track of selected item IDs.
	 */
	function updateSelectedIds() {
		state.selectedIds = [];
		$('.imgsentry-item-checkbox:checked').each(function () {
			state.selectedIds.push($(this).val());
		});
	}

	/**
	 * Fetch media list from server.
	 */
	function loadMedia() {
		showLoading();

		var data = {
			action: 'imgsentry_fetch_media',
			nonce: imgsentry_data.nonce,
			status: state.status,
			type: state.type,
			search: state.search,
			date_from: state.dateFrom,
			date_to: state.dateTo,
			page: state.page
		};

		$.post(imgsentry_data.ajax_url, data, function (response) {
			if (response.success) {
				renderMediaItems(response.data.items);
				renderPagination(response.data.total, response.data.pages, response.data.page);
				updateStats(response.data.stats);
			} else {
				$container.html('<div class="imgsentry-empty-notice"><p>Error loading media items.</p></div>');
			}
		});
	}

	/**
	 * Show loading state in media container.
	 */
	function showLoading() {
		$container.html(
			'<div class="imgsentry-loading-spinner">' +
			'<span class="spinner is-active"></span>' +
			'<span>Scanning Media Library...</span>' +
			'</div>'
		);
	}

	/**
	 * Render Media Items DOM Cards / List rows.
	 */
	function renderMediaItems(items) {
		if (!items || items.length === 0) {
			$container.html(
				'<div class="imgsentry-empty-notice">' +
				'<span class="dashicons dashicons-portfolio"></span>' +
				'<h3>No media items found</h3>' +
				'<p>Try adjusting your search query or filters.</p>' +
				'</div>'
			);
			return;
		}

		var html = '';

		$.each(items, function (index, item) {
			var iconClass = getCategoryIcon(item.category);
			var isTrashed = state.status === 'trash';

			html += '<div class="imgsentry-card-item" data-id="' + item.id + '">';

			// Checkbox
			html += '<div class="imgsentry-item-select">';
			html += '<input type="checkbox" class="imgsentry-item-checkbox" value="' + item.id + '" />';
			html += '</div>';

			// Preview / Thumbnail
			html += '<div class="imgsentry-item-preview">';
			if (item.thumb_url) {
				html += '<img src="' + item.thumb_url + '" alt="' + escapeHtml(item.title) + '" />';
			} else {
				html += '<div class="imgsentry-file-icon"><span class="dashicons ' + iconClass + '"></span><span class="imgsentry-ext">' + item.extension.toUpperCase() + '</span></div>';
			}

			// Badges
			html += '<div class="imgsentry-badges-container">';
			if (item.in_use) {
				html += '<span class="imgsentry-badge-tag imgsentry-badge-use" title="' + escapeHtml(item.use_reasons.join(', ')) + '">In Use</span>';
			} else {
				html += '<span class="imgsentry-badge-tag imgsentry-badge-unattached">Unattached</span>';
			}
			html += '</div>';

			html += '</div>'; // end preview

			// Details
			html += '<div class="imgsentry-item-details">';
			html += '<h4 class="imgsentry-item-title" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title || item.filename) + '</h4>';
			html += '<p class="imgsentry-item-meta">';
			html += '<span class="imgsentry-file-name">' + escapeHtml(item.filename) + '</span> • ';
			html += '<span class="imgsentry-file-size">' + item.formatted_size + '</span>';
			html += '</p>';
			html += '<p class="imgsentry-item-date">Uploaded: ' + item.upload_date + '</p>';

			if (isTrashed) {
				html += '<p class="imgsentry-trashed-info">Trashed: ' + item.trashed_date + ' (' + item.days_in_trash + 'd ago)</p>';
			}

			html += '</div>'; // end details

			// Quick Action Bar
			html += '<div class="imgsentry-item-actions">';
			if (isTrashed) {
				html += '<button type="button" class="button button-small imgsentry-action-restore" data-id="' + item.id + '">Restore</button>';
				html += '<button type="button" class="button button-small button-link-delete imgsentry-action-delete" data-id="' + item.id + '">Delete</button>';
			} else {
				html += '<button type="button" class="button button-small imgsentry-action-trash" data-id="' + item.id + '" title="Move to Trash"><span class="dashicons dashicons-trash"></span> Trash</button>';
				html += '<button type="button" class="button button-small button-link-delete imgsentry-action-delete" data-id="' + item.id + '" title="Delete Permanently"><span class="dashicons dashicons-no-alt"></span> Delete</button>';
			}
			html += '</div>';

			html += '</div>'; // end card item
		});

		$container.html(html);
	}

	/**
	 * Get Dashicon class based on file category.
	 */
	function getCategoryIcon(category) {
		switch (category) {
			case 'fonts':
				return 'dashicons-editor-customchar';
			case 'documents':
				return 'dashicons-document';
			case 'audio':
				return 'dashicons-media-audio';
			case 'video':
				return 'dashicons-media-video';
			case 'images':
				return 'dashicons-format-image';
			default:
				return 'dashicons-default-media';
		}
	}

	/**
	 * Render Pagination Controls.
	 */
	function renderPagination(total, pages, currentPage) {
		if (total === 0) {
			$paginationInfo.html('');
			$paginationLinks.html('');
			return;
		}

		$paginationInfo.html('Showing page ' + currentPage + ' of ' + pages + ' (' + total + ' items total)');

		var linksHtml = '';
		if (pages > 1) {
			if (currentPage > 1) {
				linksHtml += '<button type="button" class="button imgsentry-page-btn" data-page="' + (currentPage - 1) + '">&laquo; Prev</button> ';
			}
			for (var i = 1; i <= pages; i++) {
				if (i === currentPage) {
					linksHtml += '<span class="imgsentry-page-current">' + i + '</span> ';
				} else if (i === 1 || i === pages || Math.abs(i - currentPage) <= 2) {
					linksHtml += '<button type="button" class="button imgsentry-page-btn" data-page="' + i + '">' + i + '</button> ';
				}
			}
			if (currentPage < pages) {
				linksHtml += '<button type="button" class="button imgsentry-page-btn" data-page="' + (currentPage + 1) + '">Next &raquo;</button>';
			}
		}

		$paginationLinks.html(linksHtml);

		// Pagination click event
		$('.imgsentry-page-btn').off('click').on('click', function () {
			state.page = $(this).data('page');
			loadMedia();
		});
	}

	/**
	 * Perform single item AJAX action.
	 */
	function performAction(actionName, extraData) {
		showLoading();

		var data = $.extend({
			action: actionName,
			nonce: imgsentry_data.nonce
		}, extraData);

		$.post(imgsentry_data.ajax_url, data, function (response) {
			if (response.success) {
				showToast(response.data.message, 'success');
				updateStats(response.data.stats);
				loadMedia();
			} else {
				showToast(response.data.message || 'Action failed.', 'error');
				loadMedia();
			}
		});
	}

	/**
	 * Perform bulk action for selected IDs.
	 */
	function performBulkAction(bulkAction, ids) {
		showLoading();

		var data = {
			action: 'imgsentry_bulk_action',
			nonce: imgsentry_data.nonce,
			bulk_action: bulkAction,
			ids: ids
		};

		$.post(imgsentry_data.ajax_url, data, function (response) {
			if (response.success) {
				showToast(response.data.message, 'success');
				updateStats(response.data.stats);
				state.selectedIds = [];
				$('#imgsentry-select-all').prop('checked', false);
				loadMedia();
			} else {
				showToast(response.data.message || 'Bulk action failed.', 'error');
				loadMedia();
			}
		});
	}

	/**
	 * Update top stats widgets & tab badges.
	 */
	function updateStats(stats) {
		if (!stats) return;

		$('#imgsentry-stat-active-count').text(stats.active_count);
		$('#imgsentry-stat-active-size').text(stats.active_size_formatted);
		$('#imgsentry-stat-trash-count').text(stats.trashed_count);
		$('#imgsentry-stat-trash-size').text(stats.trashed_size_formatted);

		$('#imgsentry-tab-active-badge').text(stats.active_count);
		$('#imgsentry-tab-trash-badge').text(stats.trashed_count);
	}

	/**
	 * Display Toast Notification.
	 */
	function showToast(message, type) {
		var $toast = $('#imgsentry-toast');
		$toast.removeClass('imgsentry-toast-success imgsentry-toast-error')
			.addClass(type === 'error' ? 'imgsentry-toast-error' : 'imgsentry-toast-success')
			.text(message)
			.addClass('show');

		setTimeout(function () {
			$toast.removeClass('show');
		}, 3500);
	}

	/**
	 * Escape string for HTML injection.
	 */
	function escapeHtml(text) {
		if (!text) return '';
		return text.toString()
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	// Run init
	init();
});
