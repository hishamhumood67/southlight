#!/usr/bin/env bash
# Downloads the NASA data used by SouthLight into data_raw/
set -euo pipefail
mkdir -p data_raw && cd data_raw
N=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
curl -sO $N/lsk/naif0012.tls
curl -sO $N/pck/pck00011.tpc
curl -sO $N/pck/moon_pa_de440_200625.bpc
curl -sO $N/fk/satellites/moon_de440_250416.tf
curl -sO $N/spk/planets/de440s.bsp
L=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
for f in ldem_85s_40m ldem_75s_240m; do curl -sO $L/$f.lbl; curl -sO $L/$f.img; done
echo "done"
