import './module.js';

import { unByKey } from 'ol/Observable';

import templateHTML from './templates/timeseriessettings.html';

angular.module('anol.timeseries')

    /**
     * @ngdoc directive
     * @name anol.timeseries.directive:anolTimeseriessettings
     *
     * @restrict A
     *
     * @param {anol.layer.Layer} layer The time series layer
     * @param {string} templateUrl Url to template to use instead of default one
     *
     * @description
     * The always-visible line below a time series layer, showing the time of
     * the data currently drawn on the map. Clicking it opens the shared dialog.
     */
    .directive('anolTimeseriessettings', ['$templateRequest', '$compile', '$document', '$filter',
        'TimeSeriesDialogService', 'TimeSeriesService',
        function ($templateRequest, $compile, $document, $filter, TimeSeriesDialogService, TimeSeriesService) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                scope: {
                    layer: '='
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    TimeSeriesService.init();

                    const dialogId = TimeSeriesDialogService.createDialogId();

                    scope.openDialog = function () {
                        const boundingRect = element[0].getBoundingClientRect();
                        TimeSeriesDialogService.openDialog(dialogId, {
                            layer: scope.layer,
                            boundingRect: boundingRect
                        });
                    };

                    /**
                     * What the map is currently showing. Times are UTC,
                     * matching what is queried - see the note in the dialog
                     * directive.
                     */
                    scope.timeLabel = function () {
                        const layer = scope.layer;
                        if (!layer || !layer.hasTimeSeries()) {
                            return '';
                        }
                        const granularity = layer.getGranularity();
                        const window = layer.getTime();

                        if (layer.getTimeSeriesMode() === 'range' && window !== undefined) {
                            // the window is half-open, so the last instant it
                            // covers is one millisecond before its end
                            const last = new Date(window.end.getTime() - 1);
                            return `${formatInstant(window.start, granularity)} – ${formatInstant(last, granularity)}`;
                        }

                        // The timestamp of the data actually drawn. In the
                        // "latest" state there is no window to fall back on,
                        // and this is the only way to see what is on the map.
                        const displayed = layer.getDisplayedTime();
                        if (displayed !== undefined) {
                            return formatInstant(displayed, granularity);
                        }
                        return window === undefined ? '' : formatInstant(window.start, granularity);
                    };

                    function formatInstant(date, granularity) {
                        switch (granularity.unit) {
                            case 'second':
                                return $filter('date')(date, 'dd.MM.yyyy, HH:mm:ss', 'UTC');
                            case 'minute':
                            case 'hour':
                                return $filter('date')(date, 'dd.MM.yyyy, HH:mm', 'UTC');
                            case 'week':
                                return $filter('translate')('anol.timeseries.CALENDAR_WEEK') + ' ' +
                                    $filter('date')(date, 'ww/yyyy', 'UTC');
                            case 'month':
                                return $filter('date')(date, 'MMMM yyyy', 'UTC');
                            case 'year':
                                return $filter('date')(date, 'yyyy', 'UTC');
                            default:
                                return $filter('date')(date, 'dd.MM.yyyy', 'UTC');
                        }
                    }

                    scope.timeIsDefault = function () {
                        return !scope.layer || !scope.layer.hasTimeSeries() ||
                            scope.layer.getTime() === undefined;
                    };

                    // Layer data arrives outside a digest cycle, so without
                    // this the label keeps showing the previous load's time.
                    const source = scope.layer && scope.layer.olLayer
                        ? scope.layer.olLayer.getSource()
                        : undefined;
                    const sourceKey = source
                        ? source.on('change', () => scope.$applyAsync())
                        : undefined;

                    function handleOutsideDialogClick(event) {
                        // uib-datepicker rebuilds its day grid when the model
                        // changes, so by the time this runs the clicked button
                        // has been detached and contains() would report it as
                        // an outside click, closing the dialog on every pick.
                        if (event.target instanceof Node && !event.target.isConnected) {
                            return;
                        }
                        const dialogEl = $document.find('#timeseries-dialog')[0];
                        const clickedDialog = dialogEl?.contains(event.target);
                        const clickedSettings = element[0]?.contains(event.target);
                        if (TimeSeriesDialogService.isActiveDialog(dialogId) && !clickedSettings && !clickedDialog) {
                            TimeSeriesDialogService.closeDialog();
                            scope.$apply();
                        }
                    }

                    $document.on('click', handleOutsideDialogClick);

                    scope.$on('$destroy', function () {
                        $document.off('click', handleOutsideDialogClick);
                        if (sourceKey !== undefined) {
                            unByKey(sourceKey);
                        }
                        // The line is removed when its layer is switched off,
                        // which would otherwise leave the dialog open on a
                        // layer that is no longer on the map. The surrounding
                        // digest picks the change up, so no $apply here.
                        if (TimeSeriesDialogService.isActiveDialog(dialogId)) {
                            TimeSeriesDialogService.closeDialog();
                        }
                    });
                }
            };
        }]);
