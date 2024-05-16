import './module.js';
import OverviewMap from 'ol/control/OverviewMap';
import { TOUCH as hasTouch } from 'ol/has';
import View from 'ol/View';
import SingleTileWMS from "../../anol/layer/singletilewms";
import TiledWMS from "../../anol/layer/tiledwms";
import TMS from "../../anol/layer/tms";
import WMTS from "../../anol/layer/wmts";

angular.module('anol.overviewmap')
/**
 * @ngdoc directive
 * @name anol.overviewmap.directive:anolOverviewMap
 *
 * @requires $compile
 * @requires anol.map.ControlsSerivce
 * @requries anol.map.LayersService
 * @requries anol.map.MapService
 *
 * @param {boolean} overviewMapCollapsed Whether start collapsed or not. Default true.
 * @param {overviewMapLayerName} overviewMapLayerName The name of the layer to display in the overviewMap. Defaults to all layers in app.
 * @param {string} tooltipPlacement Position of tooltip
 * @param {number} tooltipDelay Time in milliseconds to wait before display tooltip
 * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens
 *
 * @description
 * Adds a overview map
 */
    .directive('anolOverviewMap', ['$compile', 'ControlsService', 'LayersService', 'MapService', function($compile, ControlsService, LayersService, MapService) {
        return {
            restrict: 'A',
            scope: {
                collapsed: '=overviewMapCollapsed',
                tooltipPlacement: '@',
                tooltipDelay: '@',
                overviewMapLayerName: '@'
            },
            link: function(scope) {
                scope.collapsed = scope.collapsed !== false;
                var backgroundLayers = LayersService.backgroundLayers
                    .filter(layer => layer.name === scope.overviewMapLayerName)
                    .map(layer => {
                        // We have to recreate the anol layers here
                        // since ol does not work properly when using
                        // the same layer instances in multiple maps (e.g. map and overview map).
                        const constructorOpts = layer.constructorOptions;
                        constructorOpts.olLayer.visible = true;
                        let layerInst;
                        switch (layer.CLASS_NAME) {
                            case 'anol.layer.SingleTileWMS':
                                layerInst = new SingleTileWMS(constructorOpts);
                                break;
                            case 'anol.layer.TiledWMS':
                                layerInst = new TiledWMS(constructorOpts);
                                break;
                            case 'anol.layer.TMS':
                                layerInst = new TMS(constructorOpts);
                                break;
                            case 'anol.layer.WMTS':
                                layerInst = new WMTS(constructorOpts);
                                break;
                            default:
                                break;
                        }
                        if (!layerInst) {
                            console.log('Could not create overlay layer');
                            return undefined;
                        }
                        var sourceOptions = angular.extend({}, layerInst.olSourceOptions);
                        const olSource = new layerInst.OL_SOURCE_CLASS(sourceOptions);
                        olSource.set('anolLayers', [layerInst]);
                        const layerOpts = layerInst.olLayerOptions;
                        layerOpts.source = olSource;
                        const olLayer = new layerInst.OL_LAYER_CLASS(layerOpts);
                        return olLayer;
                    });

                var olControl = new OverviewMap({
                    layers: backgroundLayers,
                    label: document.createTextNode(''),
                    collapseLabel: document.createTextNode(''),
                    collapsed: scope.collapsed,
                    view: new View({
                        projection: MapService.getMap().getView().getProjection(),
                        minZoom: 4,
                        maxZoom: 5
                    })
                });
                var control = new anol.control.Control({
                    olControl: olControl
                });

                // disable nativ tooltip
                var overviewmapButton = angular.element(olControl.element).find('button');
                overviewmapButton.removeAttr('title');
                // add cool tooltip
                overviewmapButton.attr('uib-tooltip', '{{ \'anol.overviewmap.TOOLTIP\' | translate }}');
                overviewmapButton.attr('tooltip-placement', scope.tooltipPlacement || 'right');
                overviewmapButton.attr('tooltip-append-to-body', true);
                overviewmapButton.attr('tooltip-popup-delay', scope.tooltipDelay || 500);
                overviewmapButton.attr('tooltip-enable', angular.isUndefined(scope.tooltipEnable) ? !hasTouch : scope.tooltipEnable);
                overviewmapButton.attr('tooltip-trigger', 'mouseenter');
                // add icon
                // cannot use ng-class, because icon change comes to late after click
                overviewmapButton.attr('ng-click', 'updateIcon()');
                var overviewmapButtonIcon = angular.element('<span class="glyphicon glyphicon-chevron-' + (scope.collapsed ? 'right' : 'left') + '"></span>');
                overviewmapButton.append(overviewmapButtonIcon);

                $compile(overviewmapButton)(scope);
                ControlsService.addControl(control);

                scope.updateIcon = function() {
                    var collapsed = olControl.getCollapsed();
                    overviewmapButtonIcon.removeClass('glyphicon-chevron-' + (collapsed ? 'left' : 'right'));
                    overviewmapButtonIcon.addClass('glyphicon-chevron-' + (collapsed ? 'right' : 'left'));
                };
            }
        };
    }]);
