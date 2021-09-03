# LotR

Build system to generate Web Assembly (WASM) Emulator cores and run them from a self-hosted server

## Setup Steps

  - [Git Setup and Submodules](#git-setup-and-submodules)
  - [Emscripten Setup](#emscripten-setup)
  - [Running Emulators Locally](#running-emulators-locally)
    - [Building WASM Emulator Cores](#building-wasm-emulator-cores)
    - [Sourcing ROMs for WASM](#sourcing-roms-for-wasm)
    - [Serving the Example](#serving-the-example)
    - [Running the Example](#running-the-example)
  - [Uploading wasm cores and roms](#uploading-wasm-cores-and-roms)

### Git Setup and Submodules

    git clone --recursive https://github.com/kivutar/lotr.git

### Emscripten Setup

A specific version of the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) is required.
Newer versions will usually cause build or runtime errors.

## Running Emulators Locally

The example (`./example`) is a sandboxed directory from which a mini-web-server can be hosted. It needs to contain
all the relevant html and js files needed to launch an emulator. The HTML and plain JS portions are static and
checked into GIT. The WASM portions are build artifacts (see `make` instructions below) and are built into `./example`
by default

### Building WASM Emulator Cores

You can build a single core like this:

    make mesen -j8

The build core will be output to `./example` dir

You can also build everything at once, though this mostly intended for the CI builders and is usually
a very slow process when iterating on WASM libretro changes since those force a rebuild of all emulators:

    make all -j8

### Sourcing ROMs for WASM

Assets for wasm come as .js/.data pairs and are generated via Emscripten's `file_packager.py`.

To package a rom from an original binary or disc:

    python3 ~/emsdk/upstream/emscripten/tools/file_packager.py \
        "./example/Micro Mages.data" \
        --preload "./Micro Mages.nes" \
        --js-output="./example/Micro Mages.js"

### Serving the Example

Serve the content over HTTP, for example like this:

    python3 -m http.server 8000 --directory ./example

Or

    make serve

You can then open http://localhost:8000 in your browser of choice.

### Running the Example

Your `example/index.html` will need to import the emulator and the ROM like this:

    <script src="Micro Mages.js"></script>
    <script src="mesen_libretro.js"></script>

And your `example/main.js` will need to launch the ROM:

    run("Micro Mages.nes");
