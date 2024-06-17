Map workflow:

- Download map as json from https://nationaalgeoregister.nl/geonetwork/srv/dut/catalog.search#/metadata/10d1153e-778f-4995-9b6c-7c69b196cccb
- Filter to features where "description" == "landsdeel"
- Merge all remaining features
- Export and upload to [mapshaper.org](https://mapshaper.org/)
- Simplify, play around with the slider, the goal is to hide all tiny messy details and reduce filesize a bit
- Repair intersections
- Export as geojson
