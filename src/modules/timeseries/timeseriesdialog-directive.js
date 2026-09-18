import './module.js';
import './availability.js';

import templateHTML from './templates/timeseriesdialog.html';
import { timeWindow, needsTimeOfDay, resolveConfiguredTime } from './time.js';

/**
 * Selectable values for a unit that is stepped by `count` within a parent of
 * `size` values, e.g. minutes 0/10/20/30/40/50 for `PT10M`.
 *
 * @param {number} size
 * @param {number} count
 * @return {number[]}
 */
function steppedOptions(size, count) {
    const options = [];
    for (let value = 0; value < size; value += count) {
        options.push(value);
    }
    return options;
}

angular.module('anol.timeseries')

    /**
     * @ngdoc directive
     * @name anol.timeseries.directive:anolTimeseriesdialog
     *
     * @restrict A
     *
     * @description
     * The singleton dialog holding the time selection - and, where the layer
     * opts in, the viewport filter - of the layer whose line was clicked.
     *
     * All times are UTC. SensorThings timestamps are UTC and the window
     * boundaries are floored in UTC, so showing local times here would put the
     * displayed boundary in a different bucket than the one being queried.
     */
    .directive('anolTimeseriesdialog', ['$templateRequest', '$compile', '$q',
        'TimeSeriesDialogService', 'TimeSeriesService', 'TimeSeriesAvailabilityService',
        function ($templateRequest, $compile, $q, TimeSeriesDialogService, TimeSeriesService, AvailabilityService) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    /**
                     * Dropped below the layer entry, or raised above it when
                     * the entry sits in the lower half of the viewport. Either
                     * way the dialog is capped to the room on that side and
                     * scrolls inside, so a tall picker never leaves the screen.
                     */
                    const EDGE_MARGIN = 10;
                    const updateDialogPosition = function () {
                        if (!scope.activeDialog) {
                            return;
                        }
                        const rect = scope.activeDialog.boundingRect;
                        const viewportHeight = window.innerHeight;
                        if (rect.bottom > viewportHeight / 2) {
                            scope.dialogStyle = {
                                // the stylesheet pins top: 0
                                top: 'auto',
                                bottom: `${viewportHeight - rect.top + 2}px`,
                                maxHeight: `${rect.top - 2 - EDGE_MARGIN}px`
                            };
                            return;
                        }
                        scope.dialogStyle = {
                            top: `${rect.bottom + 2}px`,
                            maxHeight: `${viewportHeight - rect.bottom - 2 - EDGE_MARGIN}px`
                        };
                    };

                    /**
                     * Rebuild the editable state from the layer.
                     */
                    const readLayer = function () {
                        const layer = scope.activeDialog && scope.activeDialog.layer;
                        if (!layer) {
                            return;
                        }

                        scope.hasTimeSeries = layer.hasTimeSeries();
                        scope.hasViewportFilter = layer.hasViewportFilter();
                        scope.viewport = {
                            mode: layer.getViewportFilter() ? 'viewport' : 'off'
                        };

                        if (!scope.hasTimeSeries) {
                            return;
                        }

                        const granularity = layer.getGranularity();
                        scope.granularity = granularity;
                        scope.mode = layer.getTimeSeriesMode();
                        scope.showTimeOfDay = needsTimeOfDay(granularity.unit);
                        scope.showYearSelect = granularity.unit === 'year';
                        scope.showWeeks = granularity.unit === 'week';
                        scope.gridMinMode = granularity.unit === 'month' ? 'month' : 'day';

                        applyBounds();

                        if (granularity.unit === 'second') {
                            scope.hourOptions = steppedOptions(24, 1);
                            scope.minuteOptions = steppedOptions(60, 1);
                            scope.secondOptions = steppedOptions(60, granularity.count);
                        } else if (granularity.unit === 'minute') {
                            scope.hourOptions = steppedOptions(24, 1);
                            scope.minuteOptions = steppedOptions(60, granularity.count);
                            scope.secondOptions = undefined;
                        } else if (granularity.unit === 'hour') {
                            scope.hourOptions = steppedOptions(24, granularity.count);
                            scope.minuteOptions = undefined;
                            scope.secondOptions = undefined;
                        }

                        const window = layer.getTime();
                        scope.latest = window === undefined;

                        // Editing always starts from a concrete instant, so
                        // switching away from "latest" has something to show.
                        // The time of the drawn data is the most useful start.
                        const displayed = layer.getDisplayedTime();
                        const start = window ? window.start : (displayed || new Date());
                        const end = window ? new Date(window.end.getTime() - 1) : (displayed || new Date());
                        scope.start = splitInstant(start);
                        scope.end = splitInstant(end);
                        scope.browse = scope.start.date;
                        scope.pickingEnd = false;
                    };

                    /**
                     * @param {Date} date
                     */
                    const splitInstant = function (date) {
                        return {
                            date: new Date(date.getTime()),
                            hour: date.getUTCHours(),
                            minute: date.getUTCMinutes(),
                            second: date.getUTCSeconds(),
                            year: date.getUTCFullYear()
                        };
                    };

                    /**
                     * @param {{date: Date, hour: number, minute: number, second: number, year: number}} parts
                     * @return {Date}
                     */
                    const joinInstant = function (parts) {
                        if (scope.showYearSelect) {
                            return new Date(Date.UTC(parts.year, 0, 1));
                        }
                        const d = parts.date;
                        return new Date(Date.UTC(
                            d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                            parts.hour || 0, parts.minute || 0, parts.second || 0
                        ));
                    };

                    /**
                     * The extent that decides which sensors count, or
                     * `undefined` while the filter is off.
                     */
                    const scopeExtent = function () {
                        const layer = scope.activeDialog && scope.activeDialog.layer;
                        return layer && layer.getViewportFilter()
                            ? TimeSeriesService.getCurrentExtent()
                            : undefined;
                    };

                    /**
                     * Bound the picker to the span the data actually covers.
                     * The configured min/max narrow that further but never
                     * widen it past what exists.
                     */
                    const applyBounds = function () {
                        const layer = scope.activeDialog.layer;
                        const extent = scopeExtent();
                        const coverage = layer.getCoverage(extent);

                        scope.noSensorsInView = layer.getViewportFilter() &&
                            layer.getDatastreamIds(extent).length === 0;

                        // With nothing in view there is no coverage to show;
                        // fall back to the layer's full span rather than
                        // locking the picker, and say so in the dialog.
                        const effective = coverage || layer.getCoverage();

                        let min = scope.configMinDate;
                        let max = scope.configMaxDate;
                        if (effective !== undefined) {
                            min = (min === undefined || effective.start > min) ? effective.start : min;
                            max = (max === undefined || effective.end < max) ? effective.end : max;
                        }
                        scope.minDate = min;
                        scope.maxDate = max;
                        scope.yearOptions = buildYearOptions(min, max);
                    };

                    /**
                     * Which days of the shown month carry data, and which
                     * buckets of the shown day do.
                     *
                     * Deliberately never awaited by anything that updates the
                     * map: drawing the features is the priority, and these only
                     * grey out choices.
                     */
                    const refreshAvailability = function () {
                        const layer = scope.activeDialog && scope.activeDialog.layer;
                        if (!layer || !scope.hasTimeSeries || scope.showYearSelect) {
                            return;
                        }
                        const extent = scopeExtent();
                        const ids = layer.getDatastreamIds(extent);
                        const shown = scope.browse || scope.start.date || new Date();

                        AvailabilityService.daysWithData(layer, shown.getUTCFullYear(), shown.getUTCMonth(), ids)
                            .then(function (days) {
                                scope.availableDays = days;
                                scope.availableMonth = `${shown.getUTCFullYear()}-${shown.getUTCMonth()}`;
                                scope.$applyAsync();
                            }, reportAvailabilityError);

                        if (!scope.showTimeOfDay) {
                            return;
                        }
                        const days = [scope.start.date];
                        if (scope.mode === 'range' && scope.end.date) {
                            days.push(scope.end.date);
                        }
                        days.forEach(function (day) {
                            AvailabilityService.bucketsWithData(layer, day, scope.granularity, ids)
                                .then(function (buckets) {
                                    if (buckets === undefined) {
                                        return;
                                    }
                                    // the hour set is precomputed so the
                                    // template's per-option lookups stay O(1)
                                    const hours = new Set();
                                    buckets.forEach(ms => hours.add(new Date(ms).getUTCHours()));
                                    scope.bucketsByDay[dayKey(day)] = {buckets, hours};
                                    scope.$applyAsync();
                                }, reportAvailabilityError);
                        });
                    };

                    /**
                     * Availability is a nicety, so a failure must not break the
                     * dialog - but it must not vanish silently either, or a
                     * picker that greys out nothing looks like a logic error
                     * rather than a failed request.
                     */
                    function reportAvailabilityError(error) {
                        if (error && error.name === 'AbortError') {
                            return;
                        }
                        console.error('Could not determine time series availability:', error);
                    }

                    function dayKey(date) {
                        return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
                    }

                    /**
                     * The grid asks this for every day it renders. Unknown
                     * availability must read as "selectable", or the whole
                     * calendar greys out until the counts arrive.
                     */
                    scope.dayIsAvailable = function (day) {
                        if (scope.availableDays === undefined) {
                            return true;
                        }
                        if (`${day.getUTCFullYear()}-${day.getUTCMonth()}` !== scope.availableMonth) {
                            return true;
                        }
                        return scope.availableDays.has(day.getUTCDate());
                    };

                    /**
                     * Paging to another month re-runs the availability lookup
                     * for it.
                     */
                    scope.onBrowse = function (month) {
                        scope.browse = month;
                        refreshAvailability();
                    };

                    /**
                     * A day picked in the grid. A range takes two clicks - the
                     * first sets the start and clears the end, the second sets
                     * the end - and only then reloads, so the map never shows
                     * a half-picked range. A second click before the first
                     * swaps the two rather than producing an empty result.
                     */
                    scope.onSelect = function (day) {
                        if (scope.mode !== 'range') {
                            scope.start.date = day;
                            scope.applyTime();
                            return;
                        }
                        if (!scope.pickingEnd) {
                            scope.start.date = day;
                            scope.end.date = undefined;
                            scope.pickingEnd = true;
                            return;
                        }
                        scope.end.date = day;
                        scope.pickingEnd = false;
                        if (day < scope.start.date) {
                            scope.end.date = scope.start.date;
                            scope.start.date = day;
                        }
                        scope.applyTime();
                    };

                    /**
                     * Whether one option of the hour/minute/second selects has
                     * data behind it, for the template to grey it out.
                     *
                     * Unknown availability reads as selectable, so the controls
                     * stay usable while the lookup is still running or was
                     * never made.
                     *
                     * @param {Object} parts scope.start or scope.end
                     * @param {'hour'|'minute'|'second'} field the select in question
                     * @param {number} value the option's value
                     */
                    scope.slotHasData = function (parts, field, value) {
                        if (!parts || !parts.date) {
                            return true;
                        }
                        const known = scope.bucketsByDay[dayKey(parts.date)];
                        if (known === undefined) {
                            return true;
                        }
                        // an hour is offered when anything inside it has data,
                        // not only the currently chosen minute
                        if (field === 'hour' && scope.granularity.unit !== 'hour') {
                            return known.hours.has(value);
                        }
                        const d = parts.date;
                        const instant = new Date(Date.UTC(
                            d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                            field === 'hour' ? value : (parts.hour || 0),
                            field === 'minute' ? value : (parts.minute || 0),
                            field === 'second' ? value : (parts.second || 0)
                        ));
                        return known.buckets.has(timeWindow(instant, scope.granularity).start.getTime());
                    };

                    /** Availability per day, keyed by dayKey(). */
                    scope.bucketsByDay = {};

                    scope.activeDialog = TimeSeriesDialogService.getActiveDialogData();
                    if (scope.activeDialog) {
                        const config = scope.activeDialog.layer.timeSeries;
                        scope.configMinDate = config ? resolveConfiguredTime(config.min) : undefined;
                        scope.configMaxDate = config ? resolveConfiguredTime(config.max) : undefined;
                    }
                    readLayer();
                    updateDialogPosition();
                    refreshAvailability();

                    const unsubscribeMapMove = TimeSeriesService.onMapMove(function () {
                        if (scope.activeDialog && scope.activeDialog.layer.getViewportFilter()) {
                            applyBounds();
                            refreshAvailability();
                        }
                    });

                    scope.$on('$destroy', function () {
                        unsubscribeMapMove();
                        AvailabilityService.cancelPending();
                    });

                    scope.$watch(function () {
                        return TimeSeriesDialogService.getActiveDialogData();
                    }, function (newVal) {
                        scope.activeDialog = newVal;
                        readLayer();
                        updateDialogPosition();
                    });

                    scope.closeDialog = TimeSeriesDialogService.closeDialog;

                    scope.applyTime = function () {
                        const layer = scope.activeDialog.layer;
                        if (scope.mode === 'range' && !scope.showYearSelect && !scope.end.date) {
                            // the hour selects fire this too, and a range with
                            // its end still to be picked is not ready to query
                            return;
                        }
                        scope.latest = false;

                        const startWindow = timeWindow(joinInstant(scope.start), scope.granularity);
                        let reload;
                        if (scope.mode === 'range') {
                            const endWindow = timeWindow(joinInstant(scope.end), scope.granularity);
                            // a backwards range would produce an empty result
                            // set rather than an error, which reads as a bug
                            if (endWindow.end <= startWindow.start) {
                                reload = layer.setTime(startWindow);
                            } else {
                                reload = layer.setTime({start: startWindow.start, end: endWindow.end});
                            }
                        } else {
                            reload = layer.setTime(startWindow);
                        }

                        // Redrawing the map comes first. Availability only
                        // greys out choices, so it waits for the feature
                        // request to finish rather than competing with it for
                        // the browser's connections.
                        $q.when(reload).finally(refreshAvailability);
                    };

                    /**
                     * Drop the time filter and move the controls to the newest
                     * reading. That timestamp is only known once the unfiltered
                     * response is in, so the jump waits for the reload.
                     *
                     * Stays clickable while already in this state: time passes,
                     * and re-clicking re-syncs to whatever is newest now.
                     */
                    scope.setLatest = function () {
                        const layer = scope.activeDialog.layer;
                        scope.latest = true;
                        $q.when(layer.setTime(undefined)).then(function () {
                            const displayed = layer.getDisplayedTime();
                            if (displayed !== undefined) {
                                scope.start = splitInstant(displayed);
                                scope.end = splitInstant(displayed);
                                scope.browse = scope.start.date;
                            }
                            scope.pickingEnd = false;
                            scope.$applyAsync();
                        });
                    };

                    scope.applyViewport = function () {
                        scope.activeDialog.layer.setViewportFilter(scope.viewport.mode === 'viewport');
                        applyBounds();
                        refreshAvailability();
                    };
                }
            };

            /**
             * Year granularity gets a select rather than clicking through the
             * datepicker's year grid.
             */
            function buildYearOptions(minDate, maxDate) {
                const first = minDate ? minDate.getUTCFullYear() : new Date().getUTCFullYear() - 20;
                const last = maxDate ? maxDate.getUTCFullYear() : new Date().getUTCFullYear();
                const years = [];
                for (let year = last; year >= first; year -= 1) {
                    years.push(year);
                }
                return years;
            }
        }]);
