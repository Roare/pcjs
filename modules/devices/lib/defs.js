/**
 * @fileoverview Basic definitions
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @copyright © 2012-2019 Jeff Parsons
 *
 * This file is part of PCjs, a computer emulation software project at <https://www.pcjs.org>.
 *
 * PCjs is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * PCjs is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with PCjs.  If not,
 * see <http://www.gnu.org/licenses/gpl.html>.
 *
 * You are required to include the above copyright notice in every modified copy of this work
 * and to display that copyright notice when the software starts running; see COPYRIGHT in
 * <https://www.pcjs.org/modules/devices/machine.js>.
 *
 * Some PCjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of PCjs
 * for purposes of the GNU General Public License, and the author does not claim any copyright
 * as to their contents.
 */

"use strict";

/**
 * COMMAND is the default name of the global command handler we will define, to provide
 * the same convenient access to all the WebIO COMMAND handlers that the Debugger enjoys.
 *
 * @define {string}
 */
var COMMAND = "command";

/**
 * COMPILED is false by default; overridden with true in the Closure Compiler release.
 *
 * @define {boolean}
 */
var COMPILED = false;

/**
 * DEBUG is true by default, enabling assertions and other runtime checks; overridden with false
 * in the Closure Compiler release, which generally results in the removal of any DEBUG code.  Our
 * gulpfile, however, takes the extra precaution of physically removing all "assert" method calls
 * from the concatenated file that is generated for the Closure Compiler.
 *
 * @define {boolean}
 */
var DEBUG = true;

/**
 * FACTORY is "Machine" by default; overridden with the machine's "factory" string in machines.json
 * to ensure unique factories.
 *
 * @define {string}
 */
var FACTORY = "Machine";

/**
 * MAXDEBUG is false by default; overridden with false in the Closure Compiler release.  Set it to
 * true to manually to enable any hyper-aggressive DEBUG checks.
 *
 * @define {boolean}
 */
var MAXDEBUG = false;

/**
 * VERSION is the current PCjs Project release number, updated somewhat arbitrarily and usually only after
 * significant changes.  It will be overriden the machine's "version" string in machines.json.
 *
 * @define {string}
 */
var VERSION = "2.00";

/*
 * The following globals CANNOT be overridden.
 *
 * LITTLE_ENDIAN is true if the browser's ArrayBuffer storage is little-endian.  If LITTLE_ENDIAN matches
 * the endian-ness of a machine being emulated, then that machine can use ArrayBuffers for Memory buffers as-is.
 */
var LITTLE_ENDIAN = function() {
    let buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, 256, true);
    return new Uint16Array(buffer)[0] === 256;
}();

/**
 * @class {Defs}
 * @unrestricted
 */
class Defs {
    /**
     * Defs()
     *
     * @this {Defs}
     */
    constructor()
    {
    }
}

Defs.CLASSES = {};
Defs.CLASSES["Defs"] = Defs;