import './module.js';

import templateHTML from './templates/monthgrid.html';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 week number of a UTC day.
 *
 * @param {number} time midnight UTC of the day
 * @return {number}
 */
function isoWeek(time) {
    const date = new Date(time);
    // shift to the Thursday of the same week; its year is the ISO year
    const weekday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - weekday + 3);
    const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
    return 1 + Math.round((date.getTime() - yearStart) / DAY_MS / 7);
}

angular.module('anol.timeseries')

    /**
     * @ngdoc directive
     * @name anol.timeseries.directive:anolMonthGrid
     *
     * @restrict A
     *
     * @param {Date} value the selected day - or the start of the range
     * @param {Date} rangeEnd the end of the range; omit for a single day
     * @param {Date} browse the month on show; the parent moves it via onBrowse
     * @param {Date} minDate
     * @param {Date} maxDate
     * @param {'day'|'month'} minMode `month` offers months instead of days
     * @param {boolean} showWeeks ISO week numbers in front of each row
     * @param {Function} isAvailable `isAvailable(day)`; unknown reads as available
     * @param {Function} onSelect `onSelect(day)`
     * @param {Function} onBrowse `onBrowse(month)`
     *
     * @description
     * A calendar working entirely in UTC, with the drill-down of the
     * uib-datepicker it replaces: the title zooms out to months, then to a
     * decade of years, and picking drills back down.
     *
     * Hand-rolled, as in the Svelte app, because everything here is UTC: a
     * picker dealing in local dates would, for a German user, turn "20 August"
     * into 2026-08-19T22:00Z, which floors into the previous day's bucket. It
     * also shades a range, which uib-datepicker has no notion of.
     *
     * Browsing costs nothing: only the day view reports back, so paging through
     * years never triggers an availability lookup.
     */
    .directive('anolMonthGrid', ['$templateRequest', '$compile', '$filter',
        function ($templateRequest, $compile, $filter) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                scope: {
                    value: '=',
                    rangeEnd: '=',
                    browse: '=',
                    minDate: '=',
                    maxDate: '=',
                    minMode: '@',
                    showWeeks: '=',
                    isAvailable: '&',
                    onSelect: '&',
                    onBrowse: '&'
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    const monthMode = scope.minMode === 'month';
                    scope.mode = monthMode ? 'month' : 'day';

                    /**
                     * What the header is paging through, which is not the same
                     * as the month the day view shows. Stepping a year in month
                     * view moves this but leaves the day view alone, so
                     * onBrowse - and with it the availability lookup - only
                     * fires once a month is actually chosen.
                     */
                    scope.viewDate = scope.browse || scope.value || new Date();
                    scope.$watch('browse', function (browse) {
                        if (browse) {
                            scope.viewDate = browse;
                        }
                    });

                    const weekdayNames = [];
                    for (let i = 0; i < 7; i += 1) {
                        // 2024-01-01 is a Monday
                        weekdayNames.push($filter('date')(new Date(Date.UTC(2024, 0, 1 + i)), 'EEE', 'UTC'));
                    }
                    scope.weekdays = weekdayNames;

                    const startOfDay = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                    const startOfMonth = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
                    const startOfYear = d => Date.UTC(d.getUTCFullYear(), 0, 1);

                    /** The start of the unit the current view's cells stand for. */
                    const unitStart = function (date) {
                        if (scope.mode === 'day') {
                            return startOfDay(date);
                        }
                        return scope.mode === 'month' ? startOfMonth(date) : startOfYear(date);
                    };

                    /**
                     * Six rows of seven, starting on the Monday on or before
                     * the 1st. Rebuilt only when the month on show changes, so
                     * the buttons persist across clicks within a month.
                     */
                    const rebuild = function () {
                        const view = scope.viewDate;
                        const year = view.getUTCFullYear();
                        const month = view.getUTCMonth();

                        if (scope.mode === 'day') {
                            const first = Date.UTC(year, month, 1);
                            const weekday = (new Date(first).getUTCDay() + 6) % 7;
                            const gridStart = first - weekday * DAY_MS;
                            scope.weeks = [];
                            for (let row = 0; row < 6; row += 1) {
                                const start = gridStart + row * 7 * DAY_MS;
                                const days = [];
                                for (let column = 0; column < 7; column += 1) {
                                    const time = start + column * DAY_MS;
                                    const date = new Date(time);
                                    days.push({
                                        time,
                                        label: date.getUTCDate(),
                                        outside: date.getUTCMonth() !== month
                                    });
                                }
                                scope.weeks.push({start, number: isoWeek(start), days});
                            }
                            scope.title = $filter('date')(view, 'MMMM yyyy', 'UTC');
                        } else if (scope.mode === 'month') {
                            scope.months = [];
                            for (let index = 0; index < 12; index += 1) {
                                const time = Date.UTC(year, index, 1);
                                scope.months.push({
                                    time,
                                    label: $filter('date')(new Date(time), 'MMM', 'UTC'),
                                    outside: false
                                });
                            }
                            scope.title = String(year);
                        } else {
                            const decadeStart = Math.floor(year / 10) * 10;
                            scope.years = [];
                            for (let index = -1; index < 11; index += 1) {
                                const y = decadeStart + index;
                                scope.years.push({
                                    time: Date.UTC(y, 0, 1),
                                    label: y,
                                    outside: index < 0 || index > 9
                                });
                            }
                            scope.title = `${decadeStart} – ${decadeStart + 9}`;
                        }
                    };

                    scope.$watch(function () {
                        return `${scope.mode}:${scope.viewDate.getTime()}`;
                    }, rebuild);

                    scope.isSelected = function (cell) {
                        return (scope.value && cell.time === unitStart(scope.value)) ||
                            (scope.rangeEnd && cell.time === unitStart(scope.rangeEnd));
                    };

                    scope.inRange = function (cell) {
                        if (!scope.value || !scope.rangeEnd) {
                            return false;
                        }
                        return cell.time > unitStart(scope.value) && cell.time < unitStart(scope.rangeEnd);
                    };

                    /**
                     * Unknown availability must read as selectable, or the
                     * whole grid greys out until the counts arrive.
                     */
                    scope.isDisabled = function (cell) {
                        const {minDate, maxDate} = scope;
                        if (scope.mode === 'day') {
                            if (minDate && cell.time < startOfDay(minDate)) return true;
                            if (maxDate && cell.time > startOfDay(maxDate)) return true;
                            // an absent callback answers undefined
                            return scope.isAvailable({day: new Date(cell.time)}) === false;
                        }
                        // a month or year is out of range only when no day of
                        // it is in range
                        const date = new Date(cell.time);
                        const last = scope.mode === 'month'
                            ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
                            : Date.UTC(date.getUTCFullYear(), 11, 31);
                        if (minDate && last < startOfDay(minDate)) return true;
                        if (maxDate && cell.time > startOfDay(maxDate)) return true;
                        return false;
                    };

                    scope.pick = function (cell) {
                        const date = new Date(cell.time);
                        if (scope.mode === 'day' || (scope.mode === 'month' && monthMode)) {
                            scope.onSelect({day: date});
                        } else if (scope.mode === 'month') {
                            scope.viewDate = date;
                            scope.mode = 'day';
                            scope.onBrowse({month: date});
                        } else {
                            // stays inside the grid: the day view has not
                            // moved yet
                            scope.viewDate = date;
                            scope.mode = 'month';
                        }
                    };

                    /**
                     * Paging steps by month, year or decade depending on the
                     * view. Only the day view's step reaches the parent; the
                     * others just move what is on show.
                     */
                    scope.step = function (direction) {
                        const view = scope.viewDate;
                        const year = view.getUTCFullYear();
                        const month = view.getUTCMonth();
                        if (scope.mode === 'day') {
                            const next = new Date(Date.UTC(year, month + direction, 1));
                            scope.viewDate = next;
                            scope.onBrowse({month: next});
                        } else if (scope.mode === 'month') {
                            scope.viewDate = new Date(Date.UTC(year + direction, month, 1));
                        } else {
                            scope.viewDate = new Date(Date.UTC(year + direction * 10, month, 1));
                        }
                    };

                    scope.zoomOut = function () {
                        if (scope.mode !== 'year') {
                            scope.mode = scope.mode === 'day' ? 'month' : 'year';
                        }
                    };
                }
            };
        }]);
