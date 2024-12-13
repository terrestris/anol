import './module.js';
import Control from 'ol/control/Control';

import templateHTML from './templates/dragpopup.html';

// TODO rename to popup
angular.module('anol.featurepopup')
    /**
     * @ngdoc directive
     * @name anol.featurepopup.directive:anolDragPopup
     *
     * @restrict A
     *
     * @description
     * A dragable popup
     */
    .directive('anolDragPopup', ['ControlsService', 'PopupsService', function (ControlsService, PopupsService) {
        return {
            restrict: 'A',
            scope: {},
            replace: true,
            transclude: true,
            template: function (tElement, tAttrs) {
                if (tAttrs.templateUrl) {
                    return tAttrs.templateUrl;
                }
                return templateHTML;
            },
            link: function (scope, element) {
                element.css('display', 'none');
                scope.feature = undefined;
                scope.layer = undefined;
                scope.selects = {};

                let startX = 0;
                let startY = 0;
                let x = 0;
                let y = 0;

                const mouseMoveHandler = function (event) {
                    x = event.screenX - startX;
                    y = event.screenY - startY;
                    element
                        .css('left', x)
                        .css('top', y);
                };

                const stopTrackPosition = function () {
                    $(document).off('mouseup', stopTrackPosition);
                    $(document).off('mousemove', mouseMoveHandler);
                };

                scope.makeControl = function (options) {
                    scope.control = new anol.control.Control({
                        subordinate: false,
                        olControl: new Control({
                            element: element[0]
                        })
                    });
                    if (angular.isDefined(options.selects) && !angular.equals({}, options.selects)) {
                        scope.selects = options.selects;
                    }
                    if (angular.isDefined(options.feature)) {
                        scope.feature = options.feature;
                    }
                    scope.layer = options.layer;

                    element
                        .css('left', options.screenPosition[0])
                        .css('top', options.screenPosition[1])
                        .css('display', 'block');
                    ControlsService.addControl(scope.control);
                    element.parent().addClass('anol-popup-container');
                    x = options.screenPosition[0];
                    y = options.screenPosition[1];
                    scope.startTrackPosition(options.event);
                };

                scope.$watchCollection(function () {
                    return PopupsService.dragPopupOptions;
                }, function (n) {
                    if (n.length > 0) {
                        const dragPopupOptions = n.pop();
                        scope.makeControl(dragPopupOptions);
                    }
                });
                scope.close = function () {
                    ControlsService.removeControl(scope.control);
                };

                scope.startTrackPosition = function (event) {
                    startX = event.screenX - x;
                    startY = event.screenY - y;
                    $(document).on('mousemove', mouseMoveHandler);
                    $(document).on('mouseup', stopTrackPosition);
                };
            }
        };
    }]);
