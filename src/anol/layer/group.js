/**
 * @ngdoc object
 * @name anol.layer.Group
 *
 * @param {Object} options AnOl group options
 * @param {string} options.name Unique group name
 * @param {string} options.title Title for group
 * @param {Object} options.legend Stores informations for legend
 * @param {Array<anol.layer.Layer>} options.layers AnOl layers to group
 *
 * @description
 * Groups {@link anol.layer.Layer anol.layer.Layer}.
 */

class Group {

    constructor(options) {
        var self = this;
        this.CLASS_NAME = 'anol.layer.Group';
        this.name = options.name;
        this.title = options.title;
        this.layers = options.layers;
        this.legend = options.legend || false;
        this.options = options;
        this.abstract = options.abstract || undefined;
        this.catalog = options.catalog || false;
        this.catalogLayer = options.catalogLayer || false;
        this.singleSelect = options.singleSelect || false;
        this.singleSelectGroup = options.singleSelectGroup || false;
        this.groupLayer = true;
        this.combinable = undefined;

        if (angular.isUndefined(this.layers)) {
            this.layers = [];
        }
        angular.forEach(this.layers, function(layer) {
            layer.anolGroup = self;
        });
    }
    getVisible() {
        var self = this;
        var visible = false;
        $.each(self.layers, function(idx, layer) {
            if(layer.getVisible()) {
                visible = true;
                return false;
            }
        });
        return visible;
    }
    setVisible(visible) {
        var self = this;
        var changed = false;
        if (self.singleSelect) {
            $.each(self.layers, function(idx, layer) {
                if(layer.getVisible() !== visible) {
                    layer.setVisible(visible);
                    changed = true;
                    return false;
                }
            });
        } else {
            $.each(self.layers, function(idx, layer) {
                if(layer.getVisible() !== visible) {
                    layer.setVisible(visible);
                    changed = true;
                }
            });
        }
        if (changed) {
            angular.element(this).triggerHandler('anol.group.visible:change', [this]);
        }
    }
    onVisibleChange(func, context) {
        angular.element(this).on('anol.group.visible:change', {'context': context}, func);
    }
    offVisibleChange(func) {
        angular.element(this).off('anol.group.visible:change', func);
    }

    childrenAreCombinable() {
        if (angular.isDefined(this.childrenCombinable)) {
            return this.childrenCombinable;
        }

        this.childrenCombinable = this.layers
            .slice(1)
            .every((layer, i) => {
                const last = this.layers[i];
                return last.isCombinableInGroup(layer);
            });

        return this.childrenCombinable;
    }
}

export default Group;
