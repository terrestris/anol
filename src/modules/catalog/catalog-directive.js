import './module.js';

import templateHTML from './templates/catalog.html';

angular.module('anol.catalog')
    /**
     * @ngdoc directive
     * @name anol.catalog.anolCatalog
     *
     * @description
     * Provides a catalog of layers that can be added to map
     */
    .directive('anolCatalog', ['$templateRequest', '$compile', '$rootScope', 'CatalogService',
        function ($templateRequest, $compile, $rootScope, CatalogService) {
            return {
                restrict: 'EA',
                scope: {
                    model: '='
                },
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            let template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }
                    const pageBody = angular.element(document).find('body');
                    scope.removeWaiting = function () {
                        pageBody.removeClass('waiting');
                    }
                    scope.variant = scope.$parent.variant;
                    scope.showLayers = scope.$parent.showLayers;
                    scope.popoverEnabled = scope.variant === 'mouseover';
                    scope.defaultAbstractLimit = 200;
                    const promiseLayers = CatalogService.getSortedCatalog();
                    promiseLayers.then(function (sorted) {
                        scope.sortedGroups = sorted.groups;
                        scope.sortedLayers = sorted.layers;
                        scope.removeWaiting();
                    });

                    scope.addedGroups = CatalogService.addedGroupsName;
                    scope.addedLayers = CatalogService.addedLayersName;

                    scope.toggleVariant = function () {
                        if (scope.variant === 'mouseover') {
                            scope.variant = 'abstract';
                        } else {
                            scope.variant = 'mouseover';
                        }
                        CatalogService.setVariant(scope.variant);
                    };

                    scope.addToMap = function (layer) {
                        CatalogService.addToMap(layer.name, true);
                    };
                    scope.addGroupToMap = async function (group) {
                        await CatalogService.addGroupToMap(group.name, true);
                        $rootScope.$digest();
                    };
                    scope.removeFromMap = function (layer) {
                        CatalogService.removeFromMap(layer);
                    };
                    scope.toggleLayerVisible = function (layer) {
                        if (angular.isDefined(layer)) {
                            layer.setVisible(!layer.getVisible());
                        }
                    };
                }
            };
        }])

    .filter('catalogFilter', function () {
        return function (dataArray, searchTerm, variant) {
            if (!dataArray) {
                return;
            } else if (!searchTerm) {
                return dataArray;
            } else {
                const term = searchTerm.toLowerCase();
                return dataArray.filter(function (item) {
                    const terminTitle = item.title.toLowerCase().indexOf(term) > -1;
                    if (item.abstract && variant === 'abstract') {
                        var termInAbstract = item.abstract.toLowerCase().indexOf(term) > -1;
                        return terminTitle || termInAbstract;
                    } else {
                        return terminTitle;
                    }
                });
            }
        };
    })
    // filter directive needed when we want to be able to sort the objects on the catalog.
    // It's not possible to sort on an object
    .filter("catalogToArray", function () {
        return function (obj) {
            return Object
                .entries(obj)
                .map(function (entry) {
                    return entry[1]
                })
        };
    });
