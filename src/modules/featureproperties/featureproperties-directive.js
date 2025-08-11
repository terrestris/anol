import './module.js';

import templateHTML from './templates/featureproperties.html';

angular.module('anol.featureproperties')
    /**
     * @ngdoc directive
     * @name anol.featureproperties.directive:anolFeatureProperties
     *
     * @restrict A
     * @requires pascalprecht.translate
     *
     * @param {string} templateUrl Url to template to use instead of default one
     * @param {ol.Feature} feature Feature to show properties for
     * @param {anol.layer.Feature} layer Layer of feature
     * @param {string} translationNamespace Namespace to use in translation table. Default "featureproperties".
     *
     * @description
     * Shows feature properties for layers with 'featureinfo' property.
     *
     * Layer property **featureinfo** - {Object} - Contains properties:
     * - **properties** {Array<String>} - Property names to display
     *
     * **Translating feature properties**
     * @example
     * ```
     {
     "featureproperties": {
     "{layername}": {
     "PROPERTY_KEY": "{property key translation}",
     "property_key": {
     "property_value_1": "{property value 1 translation}",
     "property_value_2": "{property value 2 translation}"
     }
     }
     }
     }```
     *
     *
     */
    .directive('anolFeatureProperties', ['$templateRequest', '$compile', '$translate',
        function ($templateRequest, $compile, $translate) {
            return {
                restrict: 'A',
                require: '?^anolFeaturePopup',
                scope: {
                    'feature': '=',
                    'layer': '=',
                    'selects': '=',
                    'translationNamespace': '@'
                },
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs, FeaturePopupController) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }
                    scope.translationNamespace = angular.isDefined(scope.translationNamespace) ?
                        scope.translationNamespace : 'anol.featureproperties';

                    scope.propertiesCollection = [];

                    const propertiesFromFeature = function (feature, layerName, displayProperties) {
                        const featureProperties = feature.getProperties();
                        const properties = {};
                        angular.forEach(displayProperties, function (displayProp) {
                            const isPropString = typeof displayProp === 'string';
                            const key = isPropString ? displayProp : displayProp.key;
                            const value = !isPropString && displayProp.format === 'date' && featureProperties[key]
                                ? (new Date(Date.parse(featureProperties[key]))).toLocaleString()
                                : featureProperties[key];
                            if (value !== undefined && value !== null && value.toString().length > 0) {
                                const key_name = isPropString ? key : (displayProp.label ?? key);
                                properties[key] = {
                                    key: key_name,
                                    value: value
                                };
                                // We only try to translate if we have a simple key.
                                // If we have a pair, the translation is already provided.
                                if (isPropString) {
                                    const translateKey = [scope.translationNamespace, layerName, key_name.toUpperCase()].join('.');
                                    const translateValue = [scope.translationNamespace, layerName, key_name, value].join('.');
                                    // this get never rejected cause of array usage
                                    // see https://github.com/angular-translate/angular-translate/issues/960
                                    $translate([
                                        translateKey,
                                        translateValue
                                    ]).then(
                                        function (translations) {
                                            let translatedKey = translations[translateKey];
                                            let translatedValue = translations[translateValue];
                                            if (translatedKey === translateKey) {
                                                translatedKey = key_name.charAt(0).toUpperCase() + key_name.slice(1);
                                            }
                                            if (translatedValue === translateValue) {
                                                translatedValue = value;
                                            }
                                            properties[key] = {
                                                key: translatedKey,
                                                value: translatedValue
                                            };
                                        }
                                    );
                                }
                            }
                        });
                        return properties;
                    };

                    const featureChangeHandler = function (feature) {
                        const propertiesCollection = [];
                        if (angular.isUndefined(scope.layer) || !angular.isObject(scope.layer.featureinfo)) {
                            scope.propertiesCollection = propertiesCollection;
                        } else {
                            const properties = propertiesFromFeature(feature, scope.layer.name, scope.layer.featureinfo.properties);
                            if (!angular.equals(properties, {})) {
                                propertiesCollection.push(properties);
                            }
                            scope.propertiesCollection = propertiesCollection;
                        }
                        if (FeaturePopupController !== null && scope.propertiesCollection.length === 0) {
                            FeaturePopupController.close();
                        }
                    };

                    const selectsChangeHandler = function (selects) {
                        const propertiesCollection = [];
                        angular.forEach(selects, function (selectObj) {
                            const layer = selectObj.layer;
                            const features = selectObj.features;
                            if (!angular.isObject(layer.featureinfo) || features.length === 0) {
                                return;
                            }

                            scope.style = {};
                            const hasWidth = layer.featureinfo.width !== undefined && layer.featureinfo.width !== null;
                            if (hasWidth) {
                                scope.style.width = layer.featureinfo.width + 'px';
                            }
                            const hasHeight = layer.featureinfo.height !== undefined && layer.featureinfo.height !== null;
                            if (hasHeight) {
                                scope.style.height = layer.featureinfo.height + 'px';
                            }

                            const featureCount = layer.featureinfo.featureCount ?? 1;
                            for (let i = 0; i < featureCount; i++) {
                                const feature = features[i];
                                const properties = propertiesFromFeature(feature, layer.name, layer.featureinfo.properties);
                                if (!angular.equals(properties, {})) {
                                    propertiesCollection.push(properties);
                                }
                            }
                        });
                        scope.propertiesCollection = propertiesCollection;
                        if (FeaturePopupController !== null && scope.propertiesCollection.length === 0) {
                            FeaturePopupController.close();
                        }
                    };

                    scope.$watch('feature', featureChangeHandler);
                    scope.$watchCollection('selects', selectsChangeHandler);
                }
            };
        }])

    .directive('urlOrText', [function () {
        return {
            restrict: 'E',
            scope: {
                url: '=value'
            },
            link: function (scope, element) {
                const isUrl = function (s) {
                    const regexp = /(http:\/\/|https:\/\/|www\.)/;
                    return regexp.test(s);
                };
                scope.$watch('url', function (url) {
                    let content = url;
                    if (isUrl(url)) {
                        content = $('<a href="' + url + '">' + url + '</a>');
                    }
                    element.html(content);
                });
            }
        };
    }]);
