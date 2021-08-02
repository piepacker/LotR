# Control the installation direction of emsdk
EMSDK=/tmp/emsdk

RETRO_BC = libretro.bc
FE = cores/frontend
FE_SRC = $(FE)/src
FE_RETRO_BC = $(FE)/$(RETRO_BC)

LDFLAGS = -s WASM=1 -s NO_EXIT_RUNTIME=1 --bind -s MODULARIZE=1 -s FORCE_FILESYSTEM=1 -s LZ4=1
LDFLAGS += -s EXPORTED_RUNTIME_METHODS='[cwrap, intArrayFromString, allocate, stackSave, stackRestore, getValue, dynamicAlloc, ALLOC_STACK, writeArrayToMemory, LZ4]'
LDFLAGS += -s EXPORTED_FUNCTIONS='[_main, _malloc]'
LDFLAGS += -s EXPORT_NAME=libretro
LDFLAGS += --js-library $(FE_SRC)/input.js
LDFLAGS += --js-library $(FE_SRC)/audio.js
LDFLAGS += --js-library $(FE_SRC)/video.js
LDFLAGS += --js-library $(FE_SRC)/environment.js
LDFLAGS += --post-js $(FE_SRC)/libretro-post.js

LDFLAGS += -O3
#LDFLAGS += -s ASSERTIONS=1
#LDFLAGS += -s ASSERTIONS=1 -s SAFE_HEAP=1 -s STACK_OVERFLOW_CHECK=1
#LDFLAGS += -s ASSERTIONS=2 -s SAFE_HEAP=1 -s STACK_OVERFLOW_CHECK=2
#LDFLAGS += -s SAFE_HEAP_LOG=1
#LDFLAGS += -g4
#LDFLAGS += --source-map-base http://localhost:8000/

SETUP = dist

ifeq ($(OUTDIR),)
	OUTDIR := ./example/wasm
endif

$(FE_RETRO_BC): $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C $(FE) BC=$(RETRO_BC)

sameboy: $(SETUP) $(FE_RETRO_BC) sameboy.bc
	emcc $(FE_RETRO_BC) \
		cores/sameboy/libretro/sameboy_libretro_emscripten.bc \
		$(LDFLAGS) -s ALLOW_MEMORY_GROWTH=1 -o $(OUTDIR)/sameboy_libretro.js

sameboy.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/sameboy/libretro


blastem: $(SETUP) $(FE_RETRO_BC) blastem.bc
	emcc $(FE_RETRO_BC) \
		cores/blastem/blastem_libretro_emscripten.bc \
		$(LDFLAGS) -s ALLOW_MEMORY_GROWTH=1 -o $(OUTDIR)/blastem_libretro.js

blastem.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/blastem -f Makefile.libretro NEW_CORE=1

mesens: $(SETUP) $(FE_RETRO_BC) mesens.bc
	emcc $(FE_RETRO_BC) \
		cores/mesens/Libretro/mesens_libretro_emscripten.bc \
		$(LDFLAGS) -s INITIAL_MEMORY=128MB -s ALLOW_MEMORY_GROWTH=1 -o $(OUTDIR)/mesens_libretro.js

mesens.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/mesens/Libretro

mesen: $(SETUP) $(FE_RETRO_BC) mesen.bc
	emcc $(FE_RETRO_BC) \
		cores/mesen/Libretro/mesen_libretro_emscripten.bc \
		$(LDFLAGS) -s INITIAL_MEMORY=128MB -s ALLOW_MEMORY_GROWTH=1 -o $(OUTDIR)/mesen_libretro.js

mesen.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/mesen/Libretro

mamearcade: $(SETUP) $(FE_RETRO_BC) mamearcade.bc
	emcc $(FE_RETRO_BC) \
		cores/mame/mamearcade_libretro_emscripten.bc \
		$(LDFLAGS) -s INITIAL_MEMORY=512MB -s ALLOW_MEMORY_GROWTH=1 -s DISABLE_EXCEPTION_CATCHING=0 -o $(OUTDIR)/mamearcade_libretro.js

mamearcade.bc:
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/mame -f Makefile.libretro SUBTARGET=arcade

mametiny: $(SETUP) $(FE_RETRO_BC) mametiny.bc
	emcc $(FE_RETRO_BC) \
		cores/mame/mametiny_libretro_emscripten.bc \
		$(LDFLAGS) -s INITIAL_MEMORY=256MB -s ALLOW_MEMORY_GROWTH=1 -s DISABLE_EXCEPTION_CATCHING=0 -o $(OUTDIR)/mametiny_libretro.js

mametiny.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/mame -f Makefile.libretro SUBTARGET=tiny

lutro: $(SETUP) $(FE_RETRO_BC) lutro.bc
	emcc $(FE_RETRO_BC) \
		cores/lutro/lutro_libretro_emscripten.bc \
		cores/lutro/libretro-common/file/file_path.c \
		cores/lutro/libretro-common/file/file_path_io.c \
		cores/lutro/libretro-common/streams/file_stream.c \
		cores/lutro/libretro-common/compat/compat_strcasestr.c \
		cores/lutro/libretro-common/compat/compat_strl.c \
		cores/lutro/libretro-common/string/stdstring.c \
		cores/lutro/libretro-common/vfs/vfs_implementation.c \
		cores/lutro/libretro-common/audio/audio_mix.c \
		cores/lutro/libretro-common/audio/conversion/float_to_s16.c \
		-Icores/lutro/libretro-common/include \
		$(LDFLAGS) -s ALLOW_MEMORY_GROWTH=1 -s TOTAL_MEMORY=256MB -o $(OUTDIR)/lutro_libretro.js

lutro.bc: $(SETUP)
	platform=emscripten LUTRO_CONFIG=player emmake make $(MAKEFLAGS) -C cores/lutro

mgba: $(SETUP) $(FE_RETRO_BC) mgba.bc
	emcc $(FE_RETRO_BC) \
		cores/mgba/mgba_libretro_emscripten.bc \
		-Icores/mgba/libretro-common/include \
		$(LDFLAGS) -s ALLOW_MEMORY_GROWTH=1 -o $(OUTDIR)/mgba_libretro.js

mgba.bc: $(SETUP)
	platform=emscripten emmake make $(MAKEFLAGS) -C cores/mgba

dist:
	mkdir -p $(OUTDIR)

all: mametiny mesens lutro mgba blastem mamearcade mesen

clean:
	@$(RM) -f $(OUTDIR)/*_libretro.js
	@$(RM) -f $(OUTDIR)/*_libretro.wasm
	platform=emscripten emmake make -C $(FE) BC=$(RETRO_BC) clean
	platform=emscripten emmake make -C cores/lutro clean
	platform=emscripten emmake make -C cores/mgba clean
	platform=emscripten emmake make -C cores/blastem -f Makefile.libretro clean
	platform=emscripten emmake make -C cores/mesens/Libretro clean
	platform=emscripten emmake make -C cores/mesen/Libretro clean
	platform=emscripten emmake make -C cores/mame -f Makefile.libretro SUBTARGET=tiny clean

re: clean all

setup_emsdk:
	# Way to dangerous to automatically delete a directory, imagine if user set /
	@if [ -d $(EMSDK) ]; then echo "emsdk '$(EMSDK)' directory already exist, please delete-it manually"; exit 1; fi
	# Install EMSDK
	mkdir -p `dirname $(EMSDK)` && \
		cd `dirname $(EMSDK)` && \
		git clone https://github.com/emscripten-core/emsdk.git $(EMSDK) && \
		cd $(EMSDK) && \
		git checkout tags/2.0.9 && \
		echo "13e29bd55185e3c12802bc090b4507901856b2ba" > ./emscripten-releases-tot.txt && \
		./emsdk install tot && \
		./emsdk activate tot
	# Install EMSDK hack
	cp -n $(EMSDK)/upstream/emscripten/src/preamble.js $(EMSDK)/upstream/emscripten/src/preamble.js.backup || true
	cp -f src/preamble.js $(EMSDK)/upstream/emscripten/src/preamble.js


.PHONY: all clean re gz upload setup_emsdk
