import OlContextMenu from 'ol-contextmenu';
import { transform, transformExtent } from 'ol/proj';

class ContextMenu extends OlContextMenu {
    handleEntryCallback(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const target = evt.currentTarget;
        const item = this.menuEntries.get(target.id);

        if (!item) return;

        const object = this.generateResponseObj();

        this.closeMenu();
        if (item.data?.link) {
            const url = item.callback?.(object, this.map);
            return window.open(url, '_blank');
        }
        item.callback?.(object, this.map);
    }

    generateResponseObj() {
        const view = this.map.getView();

        const coordinate = this.coordinate;
        const coordinate4326 = transform(coordinate, view.getProjection().getCode(), 'EPSG:4326');

        const extent = view.calculateExtent(this.map.getSize())
        const extent4326 = transformExtent(extent, view.getProjection().getCode(), 'EPSG:4326');

        var bboxDict = {}
        bboxDict[view.getProjection().getCode()] = extent;
        bboxDict['EPSG:4326'] = extent4326;

        var coordDict = {}
        coordDict[view.getProjection().getCode()] = coordinate;
        coordDict['EPSG:4326'] = coordinate4326;

        const obj = {
            coordinates: coordDict,
            bbox: bboxDict,
            zoom: view.getZoom(),
            resolution: view.getResolution()
        };

        return obj;
    }
}

export default ContextMenu;
