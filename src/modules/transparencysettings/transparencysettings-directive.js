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

                    const dialogId = TransparencyDialogService.createDialogId();

                    scope.openDialog = function () {
                        const triggerEl = element.find('.toggle-layer-conf')[0];
                        const boundingRect = triggerEl.getBoundingClientRect();
                        TransparencyDialogService.openDialog(dialogId, {
                            group: scope.group,
                            boundingRect: boundingRect
                        });
                    };

                    function handleOutsideDialogClick(event) {
                        const dialogEl = $document.find('#transparency-dialog')[0];
                        const clickedDialog = dialogEl?.contains(event.target);
                        const clickedSettings = element[0]?.contains(event.target);
                        if (TransparencyDialogService.isActiveDialog(dialogId) && !clickedSettings && !clickedDialog) {
                            TransparencyDialogService.closeDialog();
                            scope.$apply();
                        }
                    }

                    $document.on('click', handleOutsideDialogClick);

                    scope.$on('$destroy', function () {
                        $document.off('click', handleOutsideDialogClick);
                    });
                }
            };
        }]);
