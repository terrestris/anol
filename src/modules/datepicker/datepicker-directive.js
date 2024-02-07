import './module.js';

angular.module('anol.datepicker')
    /**
     * @ngdoc directive
     * @name anol.datepicker.directive:anolDatePicker
     *
     * @restrict A
     *
     * @param {string} templateUrl Url to template to use instead of default one
     * @param {string} date The date ISO string
     *
     * @description
     * Creates a datepicker.
     *
     */
    .directive('anolDatePicker', ['$templateRequest', '$compile',
        function($templateRequest, $compile) {
            return {
                restrict: 'E',
                scope: {
                    date: '='
                },
                template: function(tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return require('./templates/datepicker.html');
                },
                link: function(scope, element, attrs) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function(html){
                            var template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    var dt = scope.date;
                    scope.dt = dt ? new Date(dt) : undefined;

                    scope.$watch('dt', function(newValue) {
                        scope.date = newValue ? newValue.toISOString() : undefined;
                    });
                    scope.$watch('date', function(newValue) {
                        scope.dt = newValue ? new Date(newValue) : undefined;
                    });

                    scope.openDatepicker = () => {
                        scope.datepickerOpen = true;
                    };
                    scope.datepickerOptions = {
                        showWeeks: false,
                        ngModelOptions: {
                            timezone: 'UTC'
                        }
                    };
                    scope.datepickerFormat = 'dd.MM.yyyy';
                    scope.openDatePickers = false;
                    scope.openDatepicker = function () {
                        scope.datepickerOpen = true;
                    };
                }
            };
        }]);
