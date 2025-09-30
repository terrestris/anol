import './module.js';

import templateHTML from './templates/transparencysettings.html';

angular.module('anol.transparencysettings')

    .directive('anolTransparencysettings', ['$templateRequest', '$compile', '$document', 'TransparencyDialogService',
        function ($templateRequest, $compile, $document, TransparencyDialogService) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                scope: {
                    group: '=',
                    title: '@'
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    scope.dialogId = attrs.dialogId || 'dialog-' + Math.random().toString(36).substr(2, 9);

                    scope.toggleShowDialog = function () {
                        TransparencyDialogService.toggleDialog(scope.dialogId);
                    }

                    scope.isDialogOpen = function () {
                        return TransparencyDialogService.isOpen(scope.dialogId);
                    };

                    scope.transparency = function (transparencyValue) {
                        if (!transparencyValue && transparencyValue !== 0) {
                            return 1 - scope.group.getUserDefinedOpacity();
                        } else {
                            scope.group.setUserDefinedOpacity(1 - transparencyValue);
                        }
                    };

                    function handleOutsideDialogClick(event) {
                        if (scope.isDialogOpen() && !element[0].contains(event.target)) {
                            scope.$apply(function() {
                                TransparencyDialogService.closeDialog(scope.dialogId);
                            });
                        }
                    }

                    $document.on('click', handleOutsideDialogClick);

                    scope.$on('$destroy', function () {
                        $document.off('click', handleOutsideDialogClick);
                    });
                }
            };
        }]);
