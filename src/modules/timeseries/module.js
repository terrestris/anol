angular.module('anol.timeseries', [])

    /**
     * Two-digit clock fields for the hour/minute/second selects.
     */
    .filter('leadingZero', function() {
        return function(value) {
            return String(value).padStart(2, '0');
        };
    })

    /**
     * The day (or week, or month) an instant falls into, at the resolution a
     * granularity's calendar offers. The time of day is left to the selects
     * next to it. UTC, like everything in this module.
     */
    .filter('timeSeriesDate', ['$filter', function($filter) {
        return function(date, granularity) {
            if (!date) {
                return '';
            }
            switch (granularity && granularity.unit) {
                case 'week':
                    return $filter('translate')('anol.timeseries.CALENDAR_WEEK') + ' ' +
                        $filter('date')(date, 'ww/yyyy', 'UTC');
                case 'month':
                    return $filter('date')(date, 'MMMM yyyy', 'UTC');
                default:
                    return $filter('date')(date, 'EEE, dd.MM.yyyy', 'UTC');
            }
        };
    }])

    /**
     * Singleton dialog bookkeeping, mirroring TransparencyDialogService.
     */
    .service('TimeSeriesDialogService', function() {
        let dialogCounter = 0;

        let activeDialogData = null;
        let activeDialogId = null;

        return {
            openDialog: function(id, data) {
                activeDialogData = data;
                activeDialogId = id;
            },
            closeDialog: function() {
                activeDialogData = null;
                activeDialogId = null;
            },
            isActiveDialog: function(id) {
                return activeDialogData !== null && id === activeDialogId;
            },
            isOpen: function() {
                return activeDialogId !== null;
            },
            getActiveDialogData: function() {
                return activeDialogData;
            },
            createDialogId: function() {
                dialogCounter += 1;
                return dialogCounter;
            }
        };
    })

    /**
     * Owns the one debounced `moveend` subscription and hands out the current
     * map extent.
     *
     * Keeping map knowledge here rather than in the layer classes means one
     * handler for all layers instead of one per layer, and leaves the framework
     * layer free of angular services. Nothing is refetched on a move - the
     * extent only decides which sensors an availability lookup covers.
     */
    .service('TimeSeriesService', ['$timeout', 'MapService',
        function($timeout, MapService) {
            const DEBOUNCE_MS = 300;

            let pending;
            let initialized = false;
            const subscribers = [];

            /**
             * @return {number[]|undefined} extent in the map's own projection,
             * or `undefined` while the map has no size yet - which happens when
             * settings are restored before it has been rendered into the DOM.
             */
            function currentExtent() {
                const map = MapService.getMap();
                const size = map.getSize();
                if (size === undefined) {
                    return undefined;
                }
                return map.getView().calculateExtent(size);
            }

            return {
                /**
                 * Called by every timeseries directive; only the first one
                 * registers, so there is one handler for all layers.
                 */
                init: function() {
                    if (initialized) {
                        return;
                    }
                    initialized = true;
                    MapService.getMap().on('moveend', function() {
                        $timeout.cancel(pending);
                        pending = $timeout(function() {
                            subscribers.forEach(callback => callback());
                        }, DEBOUNCE_MS);
                    });
                },

                /**
                 * @param {Function} callback run after the map settles
                 * @return {Function} unsubscribe
                 */
                onMapMove: function(callback) {
                    subscribers.push(callback);
                    return function() {
                        const index = subscribers.indexOf(callback);
                        if (index !== -1) {
                            subscribers.splice(index, 1);
                        }
                    };
                },

                getCurrentExtent: currentExtent
            };
        }]);
