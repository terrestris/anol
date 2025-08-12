import './module.js';

import templateHTML from './templates/transparencysettings.html';

angular.module('anol.transparencysettings')

    .directive('anolTransparencysettings', ['$templateRequest', '$compile',
        function ($templateRequest, $compile) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                scope: {
                    group: '='
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    scope.showDialog = false;

                    scope.toggleShowDialog = function () {
                        scope.showDialog = !scope.showDialog;
                    }

                    scope.transparency = function () {
                        // TODO: work with new functions
                        return scope.group.transparency();
                    }
                }
            };
        }]);
