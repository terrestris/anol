import './module.js';
import Overlay from 'ol/Overlay';
import { getCenter } from 'ol/extent';

angular.module('anol.urlmarkers')

    .directive('anolUrlMarkers', ['$compile', 'UrlMarkerService', 'MapService', function($compile, UrlMarkerService, MapService) {
        return function(scope) {
            if(!UrlMarkerService.usePopup) {
                return;
            }

            const popupTemplate = '<div class="anol-popup bottom">' +
                '<span class="anol-popup-closer glyphicon glyphicon-remove" ng-mousedown="$event.stopPropagation();"></span>' +
                '<div class="anol-popup-content" bbcode>' +
                '</div>' +
                '</div>';

            const featuresWithPopup = [];

            const displayPopup = (feature) => {
                if (feature.get('label')) {
                    const overlayTemplate = angular.element(angular.copy(popupTemplate));
                    overlayTemplate.find('.anol-popup-content').text(feature.get('label'));
                    const overlayElement = $compile(overlayTemplate)(scope);
                    const overlay = new Overlay({
                        element: overlayElement[0],
                        autoPan: false
                    });
                    overlayElement.find('.anol-popup-closer').click(function() {
                        MapService.getMap().removeOverlay(overlay);
                        featuresWithPopup.splice(featuresWithPopup.indexOf(feature), 1);
                    });
                    angular.element(overlay.getElement()).parent().addClass('anol-popup-container');
                    MapService.getMap().addOverlay(overlay);

                    overlay.setPosition(getCenter(feature.getGeometry().getExtent()));
                    featuresWithPopup.push(feature);
                }
            }

            scope.$watchCollection(() => UrlMarkerService.getFeatures(), function () {
                const features = UrlMarkerService.getFeatures();
                for (const feature of features) {
                    displayPopup(feature);
                }

                const map = MapService.getMap();
                map.on('click', e => {
                    const clicked = map.getFeaturesAtPixel(e.pixel, {
                        hitTolerance: 10
                    });
                    const feature = clicked.find(f =>
                        features.includes(f) && !featuresWithPopup.includes(f)
                    );
                    if (feature) {
                        displayPopup(feature);
                    }
                });
            });
        };
    }]);
