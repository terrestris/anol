import './module.js';
import Zoom from 'ol/control/Zoom';

angular.module('anol.zoom')

/**
 * @ngdoc directive
 * @name anol.zoom.directive:anolZoom
 *
 * @requires $compile
 * @requires anol.map.ControlsService
 *
 * @param {string} zoomInTooltipPlacement Tooltip position for zoom in button
 * @param {string} zoomOutTooltipPlacement Tooltip position for zoom out button
 * @param {number} tooltipDelay Time in milisecounds to wait before display tooltip. Default 500ms
 * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens
 *
 * @description
 * Provides zoom buttons
 */
    .directive('anolZoom', ['$compile', 'ControlsService',
        function($compile, ControlsService) {
            return {
                restrict: 'A',
                scope: {
                    zoomOutTooltipText: '@',
                    zoomOutTooltipPlacement: '@',
                    tooltipDelay: '@',
                    tooltipEnable: '@',
                    ngStyle: '='
                },
                link: function(scope) {
                    var olControl = new Zoom({
                        zoomInLabel: document.createTextNode(''),
                        zoomOutLabel: document.createTextNode('')
                    });
                    var control = new anol.control.Control({
                        olControl: olControl
                    });

                    var olControlElement = angular.element(olControl.element);

                    var zoomInButton = olControlElement.find('.ol-zoom-in');
                    zoomInButton.removeAttr('title');
                    zoomInButton.attr('uib-tooltip', '{{\'anol.zoom.TOOLTIP_ZOOM_IN\' | translate }}');
                    zoomInButton.attr('tooltip-placement', scope.zoomInTooltipPlacement || 'right');
                    zoomInButton.attr('tooltip-append-to-body', true);
                    zoomInButton.attr('tooltip-popup-delay', scope.tooltipDelay || 500);
                    zoomInButton.attr('tooltip-enable', angular.isUndefined(scope.tooltipEnable) ? !('ontouchstart' in window) : scope.tooltipEnable);
                    zoomInButton.attr('tooltip-trigger', 'mouseenter');
                    zoomInButton.removeClass('ol-zoom-in');
                    zoomInButton.append(angular.element('<span class="glyphicon glyphicon-plus"></span>'));

                    var zoomOutButton = olControlElement.find('.ol-zoom-out');
                    zoomOutButton.removeAttr('title');
                    zoomOutButton.attr('uib-tooltip', '{{\'anol.zoom.TOOLTIP_ZOOM_OUT\' | translate }}');
                    zoomOutButton.attr('tooltip-placement', scope.zoomOutTooltipPlacement || 'right');
                    zoomOutButton.attr('tooltip-append-to-body', true);
                    zoomOutButton.attr('tooltip-popup-delay', scope.tooltipDelay || 500);
                    zoomOutButton.attr('tooltip-enable', angular.isUndefined(scope.tooltipEnable) ? !('ontouchstart' in window) : scope.tooltipEnable);
                    zoomOutButton.attr('tooltip-trigger', 'mouseenter');
                    zoomOutButton.removeClass('ol-zoom-out');
                    zoomOutButton.append(angular.element('<span class="glyphicon glyphicon-minus"></span>'));

                    olControlElement.attr('ng-style', 'ngStyle');
                    $compile(olControlElement)(scope);

                    ControlsService.addControl(control);
                }
            };
        }]);
