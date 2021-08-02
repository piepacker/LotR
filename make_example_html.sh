#!/bin/bash

set -x

# TODO: add support for arbitrary .html ouptut.

emucore=$1
romname=$2
origext=$3

if (( ! $# )); then 
    echo "Generate emu+rom landing pages for the example dir."
    echo "usage: $0 [emu_core] [rom_name] [orig_ext]"
    echo "example: $0 fceumm 'Micro Mages' nes"
    exit 1
fi

if [[ -z "$romname" ]]; then
    >&2 echo "usage: $0 [emu_core] [rom_name] [orig_ext]"
    exit 1
fi

#todo: get origext from the .js ...
# example:  loadPackage({"files": [{"filename": "/Secret of Mana (France).sfc", "start": 0, "end": 2097152, ...
# (or we could look to add it ourselves as a comment to the js file)

# if [[ -z "$origext" ]]; then; fi

if [[ -z "$emucore"  || -z "$romname" ]]; then 
    >&2 echo "invalid parameters"
    exit 1
fi
romname_js=$romname.js
romname_orig=$romname.$origext

echo "Generating landing page $emucore.html for $romname_orig ..."

sed "s|\${ROM_FILE_NAME}|${romname_orig}|g
     s|\${ROM_FILE_JS}|${romname_js}|g
     s|\${CORE_FILE_JS}|${emucore}_libretro.js|g" \
        ./example/_index_html.tmpl > ./example/index_$emucore.html
