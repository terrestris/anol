import './module.js';

import template from './templates/featureform.html';

/**
 * @typedef {object} SelectOption
 * @property {string} [label]
 * @property {string} value
 */

/**
 * @typedef {object} FormField
 * @property {string} name the name of the property
 * @property {string} type the type of the input
 * @property {string} [label] the label of the input
 * @property {Array<SelectOption|string>} select the available options if type=='select'
 * @property {boolean} [required]
 */

angular.module('anol.featureform')
    /**
     * @ngdoc directive
     * @name anol.featureform.directive:anolFeatureForm
     *
     * @restrict A
     *
     * @param {string} templateUrl Url to template to use instead of default one
     * @param {ol.Feature} feature Feature to show properties for
     * @param {anol.layer.Feature} layer Layer of feature
     * @param {FormField[]} pointFields The form fields for points
     * @param {FormField[]} lineFields The form fields for lines
     * @param {FormField[]} polygonFields The form fields for polygons
     * @param {boolean} [highlightInvalid] show if fields are invalid. A `validate` function needs to be provided for this to work.
     * @param {function(FormField, any): boolean} [validate] a validation function of a value for a specific field
     *
     * @description
     * Creates a form to edit defined feature properties.
     *
     */
    .directive('anolFeatureForm', ['$templateRequest', '$compile',
        function($templateRequest, $compile) {
            return {
                restrict: 'A',
                scope: {
                    'feature': '=',
                    'layer': '=', // TODO: is this needed?
                    'pointFields': '=?',
                    'lineFields': '=?',
                    'polygonFields': '=?',
                    'highlightInvalid': '<?',
                    'validate': '&?'
                },
                template: function(tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return template;
                },
                link: function(scope, element, attrs) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function(html){
                            var template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    scope.formFields = [];
                    scope.formValues = {};

                    /**
                     * @param {ol.Feature} feature
                     */
                    var featureChangeHandler = function (feature) {
                        if (feature) {
                            scope.formValues = feature.get('formValues');

                            const geomType = feature.getGeometry().getType();
                            if (geomType === 'Point') {
                                scope.formFields = scope.pointFields;
                            } else if (geomType === 'LineString') {
                                scope.formFields = scope.lineFields;
                            } else if (geomType === 'Polygon') {
                                scope.formFields = scope.polygonFields;
                            }
                        }
                    };

                    /**
                     * @param {SelectOption|string} option
                     * @return {string}
                     */
                    scope.getOptionValue = function (option) {
                        return angular.isObject(option) ? option.value : option;
                    };

                    /**
                     * @param {SelectOption|string} option
                     * @return {string}
                     */
                    scope.getOptionLabel = function (option) {
                        return angular.isObject(option) ? option.label || option.value : option;
                    };

                    /**
                     * @param {FormField} field
                     * @returns {boolean}
                     */
                    scope.validateFeatureFormField = function (field) {
                        if (scope.validate) {
                            return scope.validate({ field: field, value: scope.formValues[field.name] });
                        }
                        return true;
                    };

                    scope.$watch('feature', featureChangeHandler);
                }
            };
        }]);
