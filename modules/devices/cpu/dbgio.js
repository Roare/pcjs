/**
 * @fileoverview Basic debugger services
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
 * Defines a general-purpose Address structure that will hopefully meet the needs of all our
 * machines.  "off" is an (up to) 32-bit offset that is assumed to be PHYSICAL unless type is
 * LINEAR.  Normally, "seg" will be -1 (indicating it is unused), unless memory is segmented,
 * in which case "seg" must be set to a non-negative identifying the segment, and "off" will be
 * interpreted as an offset within that segment.  For machines that have different types of
 * segments (eg, real-mode vs. protected-mode segments), the address is assumed to be REAL
 * unless type is PROTECTED.
 *
 * @typedef {Object} Address
 * @property {number} off
 * @property {number} seg
 * @property {number} type
 */

/**
 * Defines a Symbol object.
 *
 * @typedef {Object} SymbolObj
 * @property {Address} address
 * @property {number} type (see DbgIO.SYMBOL_TYPE values)
 * @property {string} name
 */

/**
 * Basic debugger services
 *
 * @class {DbgIO}
 * @unrestricted
 */
class DbgIO extends Device {
    /**
     * DbgIO(idMachine, idDevice, config)
     *
     * @this {DbgIO}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        /*
         * Default base (radix).
         */
        this.nDefaultBase = 16;

        /*
         * Default endian (0 = little, 1 = big).
         */
        this.nDefaultEndian = 0;                // TODO: Use it or lose it

        /*
         * Default maximum instruction (opcode) length, overridden by the CPU-specific debugger.
         */
        this.maxOpLength = 1;

        /*
         * Default parsing parameters, subexpression and address delimiters.
         */
        this.nASCIIBits = 8;                    // change to 7 for MACRO-10 compatibility
        this.achGroup = ['(',')'];
        this.achAddress = ['[',']'];

        /*
         * This controls how we stop the CPU on a break condition.  If fExceptionOnBreak is true, we'll
         * throw an exception, which the CPU will catch and halt; however, the downside of that approach
         * is that, in some cases, it may leave the CPU in an inconsistent state.  It's generally safer to
         * leave fExceptionOnBreak false, which will simply stop the clock, allowing the current instruction
         * to finish executing.
         */
        this.fExceptionOnBreak = false;

        /*
         * If greater than zero, decremented on every instruction until it hits zero, then CPU is stoppped.
         */
        this.counterBreak = 0;

        /*
         * If set to MESSAGE.ALL, then we break on all messages.  It can be set to a subset of message bits,
         * but there is currently no UI for that.
         */
        this.messagesBreak = MESSAGE.NONE;

        /*
         * variables is an object with properties that grow as setVariable() assigns more variables;
         * each property corresponds to one variable, where the property name is the variable name (ie,
         * a string beginning with a non-digit, followed by zero or more symbol characters and/or digits)
         * and the property value is the variable's numeric value.
         *
         * Note that parseValue() parses variables before numbers, so any variable that looks like a
         * unprefixed hex value (eg, "a5" as opposed to "0xa5") will trump the numeric value.  Unprefixed
         * hex values are a convenience of parseValue(), which always calls parseInt() with a default
         * base of 16; however, that default be overridden with a variety of explicit prefixes or suffixes
         * (eg, a leading "0o" to indicate octal, a trailing period to indicate decimal, etc.)
         *
         * See parseInt() for more details about supported numbers.
         */
        this.variables = {};

        /*
         * Arrays of Symbol objects, one sorted by name and the other sorted by value; see addSymbols().
         */
        this.symbolsByName = [];
        this.symbolsByValue = [];

        /*
         * Get access to the CPU, so that in part so we can connect to all its registers; the Debugger has
         * no registers of its own, so we simply replace our registers with the CPU's.
         */
        this.cpu = /** @type {CPU} */ (this.findDeviceByClass("CPU"));
        this.registers = this.cpu.connectDebugger(this);

        /*
         * Get access to the Input device, so that we can switch focus whenever we start the machine.
         */
        this.input = /** @type {Input} */ (this.findDeviceByClass("Input", false));

        /*
         * Get access to the Bus devices, so we have access to the I/O and memory address spaces.
         *
         * To minimize configuration redundancy, we rely on the CPU's configuration to get the Bus device IDs.
         */
        this.busIO = /** @type {Bus} */ (this.findDevice(this.cpu.config['busIO'], false));
        this.busMemory = /** @type {Bus} */ (this.findDevice(this.cpu.config['busMemory']));

        this.nDefaultBits = this.busMemory.addrWidth;
        this.addrMask = (Math.pow(2, this.nDefaultBits) - 1)|0;

        /*
         * Since we want to be able to clear/disable/enable/list break addresses by index number, we maintain
         * an array (aBreakIndexes) that maps index numbers to address array entries.  The mapping values are
         * a combination of BREAKTYPE (high byte) and break address entry (low byte).
         *
         * As for which ones are disabled, that will be handled by adding TWO_POW32 to the address; machine
         * performance will still be affected, because any block(s) with break addresses will still be trapping
         * accesses, so you should clear break addresses whenever possible.
         */
        this.cBreaks = 0;
        this.cBreakIgnore = 0;  // incremented and decremented around internal reads and writes
        this.aBreakAddrs = [];
        for (let type in DbgIO.BREAKTYPE) {
            this.aBreakAddrs[DbgIO.BREAKTYPE[type]] = [];
        }
        this.aBreakBuses = [];
        this.aBreakBuses[DbgIO.BREAKTYPE.READ] = this.busMemory;
        this.aBreakBuses[DbgIO.BREAKTYPE.WRITE] = this.busMemory;
        this.aBreakBuses[DbgIO.BREAKTYPE.INPUT] = this.busIO;
        this.aBreakBuses[DbgIO.BREAKTYPE.OUTPUT] = this.busIO;
        this.aBreakChecks = [];
        this.aBreakChecks[DbgIO.BREAKTYPE.READ] = this.checkBusRead.bind(this);
        this.aBreakChecks[DbgIO.BREAKTYPE.WRITE] = this.checkBusWrite.bind(this)
        this.aBreakChecks[DbgIO.BREAKTYPE.INPUT] = this.checkBusInput.bind(this)
        this.aBreakChecks[DbgIO.BREAKTYPE.OUTPUT] = this.checkBusOutput.bind(this)
        this.aBreakIndexes = [];

        /*
         * Get access to the Time device, so we can stop and start time as needed.
         */
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.time.addUpdate(this.updateDebugger.bind(this));

        /*
         * Initialize any additional properties required for our onCommand() handler.
         */
        this.addressPrev = this.newAddress();
        this.historyForced = false;
        this.historyNext = 0;
        this.historyBuffer = [];
        this.addHandler(Device.HANDLER.COMMAND, this.onCommand.bind(this));

        let commands = /** @type {string} */ (this.getMachineConfig("commands"));
        if (commands) this.parseCommands(commands);
    }

    /**
     * addSymbols(aSymbols)
     *
     * This currently supports only symbol arrays, which consist of [address,type,name] triplets; eg:
     *
     *      "0320","=","HF_PORT",
     *      "0000:0034","4","HDISK_INT",
     *      "0040:0042","1","CMD_BLOCK",
     *      "0003","@","DISK_SETUP",
     *      "0000:004C","4","ORG_VECTOR",
     *      "0028",";","GET DISKETTE VECTOR"
     *
     * There are two basic symbol operations: findSymbolByValue(), which takes an address and finds the symbol,
     * if any, at that address, and findSymbolByName(), which takes a string and attempts to match it to an address.
     *
     * @this {DbgIO}
     * @param {Array|undefined} aSymbols
     */
    addSymbols(aSymbols)
    {
        if (aSymbols && aSymbols.length) {
            for (let iSymbol = 0; iSymbol < aSymbols.length-2; iSymbol += 3) {
                let address = this.parseAddress(aSymbols[iSymbol]);
                let type = DbgIO.SYMBOL_TYPES[aSymbols[iSymbol+1]];
                this.assert(type, "unrecognized symbol type: %s", aSymbols[iSymbol+1]);
                if (!type) continue;        // ignore symbols with unrecognized types
                let name = aSymbols[iSymbol+2];
                if (address) {
                    let symbol = {address, type, name};
                    this.binaryInsert(this.symbolsByName, symbol, this.compareSymbolNames);
                    this.binaryInsert(this.symbolsByValue, symbol, this.compareSymbolValues);
                }
            }
        }
    }

    /**
     * binaryInsert(a, v, fnCompare)
     *
     * If element v already exists in array a, the array is unchanged (we don't allow duplicates); otherwise, the
     * element is inserted into the array at the appropriate index.
     *
     * @this {DbgIO}
     * @param {Array} a is an array
     * @param {Object} v is the value to insert
     * @param {function(SymbolObj,SymbolObj):number} [fnCompare]
     */
    binaryInsert(a, v, fnCompare)
    {
        let index = this.binarySearch(a, v, fnCompare);
        if (index < 0) {
            a.splice(-(index + 1), 0, v);
        }
    }

    /**
     * binarySearch(a, v, fnCompare)
     *
     * @this {DbgIO}
     * @param {Array} a is an array
     * @param {Object} v
     * @param {function(SymbolObj,SymbolObj):number} [fnCompare]
     * @return {number} the index of matching entry if non-negative, otherwise the index of the insertion point
     */
    binarySearch(a, v, fnCompare)
    {
        let left = 0;
        let right = a.length;
        let found = 0;
        if (fnCompare === undefined) {
            fnCompare = function(a, b) { return a > b? 1 : a < b? -1 : 0; };
        }
        while (left < right) {
            let middle = (left + right) >> 1;
            let compareResult;
            compareResult = fnCompare(v, a[middle]);
            if (compareResult > 0) {
                left = middle + 1;
            } else {
                right = middle;
                found = !compareResult;
            }
        }
        return found? left : ~left;
    }

    /**
     * compareSymbolNames(symbol1, symbol2)
     *
     * @this {DbgIO}
     * @param {SymbolObj} symbol1
     * @param {SymbolObj} symbol2
     * @return {number}
     */
    compareSymbolNames(symbol1, symbol2)
    {
        return symbol1.name > symbol2.name? 1 : symbol1.name < symbol2.name? -1 : 0;
    }

    /**
     * compareSymbolValues(symbol1, symbol2)
     *
     * @this {DbgIO}
     * @param {SymbolObj} symbol1
     * @param {SymbolObj} symbol2
     * @return {number}
     */
    compareSymbolValues(symbol1, symbol2)
    {
        return symbol1.address.off > symbol2.address.off? 1 : symbol1.address.off < symbol2.address.off? -1 : 0;
    }

    /**
     * findSymbolByName(name)
     *
     * Search symbolsByName for name and return the corresponding symbol (undefined if not found).
     *
     * @this {DbgIO}
     * @param {string} name
     * @return {number} the index of matching entry if non-negative, otherwise the index of the insertion point
     */
    findSymbolByName(name)
    {
        let symbol = {address: null, type: 0, name};
        return this.binarySearch(this.symbolsByName, symbol, this.compareSymbolNames);
    }

    /**
     * findSymbolByValue(address)
     *
     * Search symbolsByValue for address and return the corresponding symbol (undefined if not found).
     *
     * @this {DbgIO}
     * @param {Address} address
     * @return {number} the index of matching entry if non-negative, otherwise the index of the insertion point
     */
    findSymbolByValue(address)
    {
        let symbol = {address, type: 0, name: undefined};
        return this.binarySearch(this.symbolsByValue, symbol, this.compareSymbolValues);
    }

    /**
     * getSymbol(name)
     *
     * @this {DbgIO}
     * @param {string} name
     * @return {number|undefined}
     */
    getSymbol(name)
    {
        let value;
        let i = this.findSymbolByName(name);
        if (i >= 0) {
            let symbol = this.symbolsByName[i];
            value = symbol.address.off;
        }
        return value;
    }

    /**
     * getSymbolName(address, type)
     *
     * @this {DbgIO}
     * @param {Address} address
     * @param {number} [type]
     * @return {string|undefined}
     */
    getSymbolName(address, type)
    {
        let name;
        let i = this.findSymbolByValue(address);
        if (i >= 0) {
            let symbol = this.symbolsByValue[i];
            if (!type || symbol.type == type) {
                name = symbol.name;
            }
        }
        return name;
    }

    /**
     * delVariable(name)
     *
     * @this {DbgIO}
     * @param {string} name
     */
    delVariable(name)
    {
        delete this.variables[name];
    }

    /**
     * getVariable(name)
     *
     * @this {DbgIO}
     * @param {string} name
     * @return {number|undefined}
     */
    getVariable(name)
    {
        if (this.variables[name]) {
            return this.variables[name].value;
        }
        name = name.substr(0, 6);
        return this.variables[name] && this.variables[name].value;
    }

    /**
     * getVariableFixup(name)
     *
     * @this {DbgIO}
     * @param {string} name
     * @return {string|undefined}
     */
    getVariableFixup(name)
    {
        return this.variables[name] && this.variables[name].sUndefined;
    }

    /**
     * isVariable(name)
     *
     * @this {DbgIO}
     * @param {string} name
     * @return {boolean}
     */
    isVariable(name)
    {
        return this.variables[name] !== undefined;
    }

    /**
     * resetVariables()
     *
     * @this {DbgIO}
     * @return {Object}
     */
    resetVariables()
    {
        let a = this.variables;
        this.variables = {};
        return a;
    }

    /**
     * restoreVariables(a)
     *
     * @this {DbgIO}
     * @param {Object} a (from previous resetVariables() call)
     */
    restoreVariables(a)
    {
        this.variables = a;
    }

    /**
     * setVariable(name, value, sUndefined)
     *
     * @this {DbgIO}
     * @param {string} name
     * @param {number} value
     * @param {string|undefined} [sUndefined]
     */
    setVariable(name, value, sUndefined)
    {
        this.variables[name] = {value, sUndefined};
    }

    /**
     * addAddress(address, offset)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address} address
     * @param {number} offset
     * @return {Address}
     */
    addAddress(address, offset)
    {
        address.off = (address.off + offset) & this.busMemory.addrLimit;
        return address;
    }

    /**
     * makeAddress(address)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address|number} address
     * @return {Address}
     */
    makeAddress(address)
    {
        return typeof address == "number"? this.newAddress(address) : address;
    }

    /**
     * newAddress(address)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address|number} [address]
     * @return {Address}
     */
    newAddress(address = 0)
    {
        let seg = -1, type = DbgIO.ADDRESS.PHYSICAL;
        if (typeof address == "number") return {off: address, seg, type};
        return {off: address.off, seg: address.seg, type: address.type};
    }

    /**
     * parseAddress(sAddress)
     *
     * @this {DbgIO}
     * @param {string} sAddress
     * @return {Address|undefined|null} (undefined if no address supplied, null if a parsing error occurred)
     */
    parseAddress(sAddress)
    {
        let address;
        if (sAddress) {
            address = this.newAddress();
            let iAddr = 0;
            let ch = sAddress.charAt(iAddr);

            switch(ch) {
            case '&':
                iAddr++;
                break;
            case '#':
                iAddr++;
                address.type = DbgIO.ADDRESS.PROTECTED;
                break;
            case '%':
                iAddr++;
                ch = sAddress.charAt(iAddr);
                if (ch == '%') {
                    iAddr++;
                } else {
                    address.type = DbgIO.ADDRESS.LINEAR;
                }
                break;
            }

            let iColon = sAddress.indexOf(':', iAddr);
            if (iColon >= 0) {
                let seg = this.parseExpression(sAddress.substring(iAddr, iColon));
                if (seg == undefined) {
                    address = null;
                } else {
                    address.seg = seg;
                    iAddr = iColon + 1;
                }
            }
            if (address) {
                let off = this.parseExpression(sAddress.substring(iAddr));
                if (off == undefined) {
                    address = null;
                } else {
                    address.off = off & this.addrMask;
                }
            }
        }
        return address;
    }

    /**
     * readAddress(address, advance)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address} address
     * @param {number} [advance] (amount to advance address after read, if any)
     * @return {number|undefined}
     */
    readAddress(address, advance)
    {
        this.cBreakIgnore++;
        let value = this.busMemory.readData(address.off);
        if (advance) this.addAddress(address, advance);
        this.cBreakIgnore--;
        return value;
    }

    /**
     * writeAddress(address, value)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address} address
     * @param {number} value
     */
    writeAddress(address, value)
    {
        this.cBreakIgnore++;
        this.busMemory.writeData(address.off, value);
        this.cBreakIgnore--;
    }

    /**
     * evalAND(dst, src)
     *
     * Adapted from /modules/pdp10/lib/cpuops.js:PDP10.AND().
     *
     * Performs the bitwise "and" (AND) of two operands > 32 bits.
     *
     * @this {DbgIO}
     * @param {number} dst
     * @param {number} src
     * @return {number} (dst & src)
     */
    evalAND(dst, src)
    {
        /*
         * We AND the low 32 bits separately from the higher bits, and then combine them with addition.
         * Since all bits above 32 will be zero, and since 0 AND 0 is 0, no special masking for the higher
         * bits is required.
         *
         * WARNING: When using JavaScript's 32-bit operators with values that could set bit 31 and produce a
         * negative value, it's critical to perform a final right-shift of 0, ensuring that the final result is
         * positive.
         */
        if (this.nDefaultBits <= 32) {
            return dst & src;
        }
        /*
         * Negative values don't yield correct results when dividing, so pass them through an unsigned truncate().
         */
        dst = this.truncate(dst, 0, true);
        src = this.truncate(src, 0, true);
        return ((((dst / NumIO.TWO_POW32)|0) & ((src / NumIO.TWO_POW32)|0)) * NumIO.TWO_POW32) + ((dst & src) >>> 0);
    }

    /**
     * evalMUL(dst, src)
     *
     * I could have adapted the code from /modules/pdp10/lib/cpuops.js:PDP10.doMUL(), but it was simpler to
     * write this base method and let the PDP-10 Debugger override it with a call to the *actual* doMUL() method.
     *
     * @this {DbgIO}
     * @param {number} dst
     * @param {number} src
     * @return {number} (dst * src)
     */
    evalMUL(dst, src)
    {
        return dst * src;
    }

    /**
     * evalIOR(dst, src)
     *
     * Adapted from /modules/pdp10/lib/cpuops.js:PDP10.IOR().
     *
     * Performs the logical "inclusive-or" (OR) of two operands > 32 bits.
     *
     * @this {DbgIO}
     * @param {number} dst
     * @param {number} src
     * @return {number} (dst | src)
     */
    evalIOR(dst, src)
    {
        /*
         * We OR the low 32 bits separately from the higher bits, and then combine them with addition.
         * Since all bits above 32 will be zero, and since 0 OR 0 is 0, no special masking for the higher
         * bits is required.
         *
         * WARNING: When using JavaScript's 32-bit operators with values that could set bit 31 and produce a
         * negative value, it's critical to perform a final right-shift of 0, ensuring that the final result is
         * positive.
         */
        if (this.nDefaultBits <= 32) {
            return dst | src;
        }
        /*
         * Negative values don't yield correct results when dividing, so pass them through an unsigned truncate().
         */
        dst = this.truncate(dst, 0, true);
        src = this.truncate(src, 0, true);
        return ((((dst / NumIO.TWO_POW32)|0) | ((src / NumIO.TWO_POW32)|0)) * NumIO.TWO_POW32) + ((dst | src) >>> 0);
    }

    /**
     * evalXOR(dst, src)
     *
     * Adapted from /modules/pdp10/lib/cpuops.js:PDP10.XOR().
     *
     * Performs the logical "exclusive-or" (XOR) of two operands > 32 bits.
     *
     * @this {DbgIO}
     * @param {number} dst
     * @param {number} src
     * @return {number} (dst ^ src)
     */
    evalXOR(dst, src)
    {
        /*
         * We XOR the low 32 bits separately from the higher bits, and then combine them with addition.
         * Since all bits above 32 will be zero, and since 0 XOR 0 is 0, no special masking for the higher
         * bits is required.
         *
         * WARNING: When using JavaScript's 32-bit operators with values that could set bit 31 and produce a
         * negative value, it's critical to perform a final right-shift of 0, ensuring that the final result is
         * positive.
         */
        if (this.nDefaultBits <= 32) {
            return dst ^ src;
        }
        /*
         * Negative values don't yield correct results when dividing, so pass them through an unsigned truncate().
         */
        dst = this.truncate(dst, 0, true);
        src = this.truncate(src, 0, true);
        return ((((dst / NumIO.TWO_POW32)|0) ^ ((src / NumIO.TWO_POW32)|0)) * NumIO.TWO_POW32) + ((dst ^ src) >>> 0);
    }

    /**
     * evalOps(aVals, aOps, cOps)
     *
     * Some of our clients want a specific number of bits of integer precision.  If that precision is
     * greater than 32, some of the operations below will fail; for example, JavaScript bitwise operators
     * always truncate the result to 32 bits, so beware when using shift operations.  Similarly, it would
     * be wrong to always "|0" the final result, which is why we rely on truncate() now.
     *
     * Note that JavaScript integer precision is limited to 52 bits.  For example, in Node, if you set a
     * variable to 0x80000001:
     *
     *      foo=0x80000001|0
     *
     * then calculate foo*foo and display the result in binary using "(foo*foo).toString(2)":
     *
     *      '11111111111111111111111111111100000000000000000000000000000000'
     *
     * which is slightly incorrect because it has overflowed JavaScript's floating-point precision.
     *
     * 0x80000001 in decimal is -2147483647, so the product is 4611686014132420609, which is 0x3FFFFFFF00000001.
     *
     * @this {DbgIO}
     * @param {Array.<number>} aVals
     * @param {Array.<string>} aOps
     * @param {number} [cOps] (default is -1 for all)
     * @return {boolean} true if successful, false if error
     */
    evalOps(aVals, aOps, cOps = -1)
    {
        while (cOps-- && aOps.length) {
            let chOp = aOps.pop();
            if (aVals.length < 2) return false;
            let valNew;
            let val2 = aVals.pop();
            let val1 = aVals.pop();
            switch(chOp) {
            case '*':
                valNew = this.evalMUL(val1, val2);
                break;
            case '/':
                if (!val2) return false;
                valNew = Math.trunc(val1 / val2);
                break;
            case '^/':
                if (!val2) return false;
                valNew = val1 % val2;
                break;
            case '+':
                valNew = val1 + val2;
                break;
            case '-':
                valNew = val1 - val2;
                break;
            case '<<':
                valNew = val1 << val2;
                break;
            case '>>':
                valNew = val1 >> val2;
                break;
            case '>>>':
                valNew = val1 >>> val2;
                break;
            case '<':
                valNew = (val1 < val2? 1 : 0);
                break;
            case '<=':
                valNew = (val1 <= val2? 1 : 0);
                break;
            case '>':
                valNew = (val1 > val2? 1 : 0);
                break;
            case '>=':
                valNew = (val1 >= val2? 1 : 0);
                break;
            case '==':
                valNew = (val1 == val2? 1 : 0);
                break;
            case '!=':
                valNew = (val1 != val2? 1 : 0);
                break;
            case '&':
                valNew = this.evalAND(val1, val2);
                break;
            case '!':           // alias for MACRO-10 to perform a bitwise inclusive-or (OR)
            case '|':
                valNew = this.evalIOR(val1, val2);
                break;
            case '^!':          // since MACRO-10 uses '^' for base overrides, '^!' is used for bitwise exclusive-or (XOR)
                valNew = this.evalXOR(val1, val2);
                break;
            case '&&':
                valNew = (val1 && val2? 1 : 0);
                break;
            case '||':
                valNew = (val1 || val2? 1 : 0);
                break;
            case ',,':
                valNew = this.truncate(val1, 18, true) * Math.pow(2, 18) + this.truncate(val2, 18, true);
                break;
            case '_':
            case '^_':
                valNew = val1;
                /*
                 * While we always try to avoid assuming any particular number of bits of precision, the 'B' shift
                 * operator (which we've converted to '^_') is unique to the MACRO-10 environment, which imposes the
                 * following restrictions on the shift count.
                 */
                if (chOp == '^_') val2 = 35 - (val2 & 0xff);
                if (val2) {
                    /*
                     * Since binary shifting is a logical (not arithmetic) operation, and since shifting by division only
                     * works properly with positive numbers, we call truncate() to produce an unsigned value.
                     */
                    valNew = this.truncate(valNew, 0, true);
                    if (val2 > 0) {
                        valNew *= Math.pow(2, val2);
                    } else {
                        valNew = Math.trunc(valNew / Math.pow(2, -val2));
                    }
                }
                break;
            default:
                return false;
            }
            aVals.push(this.truncate(valNew));
        }
        return true;
    }

    /**
     * parseArray(asValues, iValue, iLimit, nBase, aUndefined)
     *
     * parseExpression() takes a complete expression and divides it into array elements, where even elements
     * are values (which may be empty if two or more operators appear consecutively) and odd elements are operators.
     *
     * For example, if the original expression was "2*{3+{4/2}}", parseExpression() would call parseArray() with:
     *
     *      0   1   2   3   4   5   6   7   8   9  10  11  12  13  14
     *      -   -   -   -   -   -   -   -   -   -  --  --  --  --  --
     *      2   *       {   3   +       {   4   /   2   }       }
     *
     * This function takes care of recursively processing grouped expressions, by processing subsets of the array,
     * as well as handling certain base overrides (eg, temporarily switching to base-10 for binary shift suffixes).
     *
     * @this {DbgIO}
     * @param {Array.<string>} asValues
     * @param {number} iValue
     * @param {number} iLimit
     * @param {number} nBase
     * @param {Array|undefined} [aUndefined]
     * @return {number|undefined}
     */
    parseArray(asValues, iValue, iLimit, nBase, aUndefined)
    {
        let value;
        let sValue, sOp;
        let fError = false;
        let unary = 0;
        let aVals = [], aOps = [];

        let nBasePrev = this.nDefaultBase;
        this.nDefaultBase = nBase;

        while (iValue < iLimit) {
            let v;
            sValue = asValues[iValue++].trim();
            sOp = (iValue < iLimit? asValues[iValue++] : "");

            if (sValue) {
                v = this.parseValue(sValue, undefined, aUndefined, unary);
            } else {
                if (sOp == '{') {
                    let cOpen = 1;
                    let iStart = iValue;
                    while (iValue < iLimit) {
                        sValue = asValues[iValue++].trim();
                        sOp = (iValue < asValues.length? asValues[iValue++] : "");
                        if (sOp == '{') {
                            cOpen++;
                        } else if (sOp == '}') {
                            if (!--cOpen) break;
                        }
                    }
                    v = this.parseArray(asValues, iStart, iValue-1, this.nDefaultBase, aUndefined);
                    if (v != null && unary) {
                        v = this.parseUnary(v, unary);
                    }
                    sValue = (iValue < iLimit? asValues[iValue++].trim() : "");
                    sOp = (iValue < iLimit? asValues[iValue++] : "");
                }
                else {
                    /*
                     * When parseExpression() calls us, it has collapsed all runs of whitespace into single spaces,
                     * and although it allows single spaces to divide the elements of the expression, a space is neither
                     * a unary nor binary operator.  It's essentially a no-op.  If we encounter it here, then it followed
                     * another operator and is easily ignored (although perhaps it should still trigger a reset of nBase
                     * and unary -- TBD).
                     */
                    if (sOp == ' ') {
                        continue;
                    }
                    if (sOp == '^B') {
                        this.nDefaultBase = 2;
                        continue;
                    }
                    if (sOp == '^O') {
                        this.nDefaultBase = 8;
                        continue;
                    }
                    if (sOp == '^D') {
                        this.nDefaultBase = 10;
                        continue;
                    }
                    if (!(unary & (0xC0000000|0))) {
                        if (sOp == '+') {
                            continue;
                        }
                        if (sOp == '-') {
                            unary = (unary << 2) | 1;
                            continue;
                        }
                        if (sOp == '~' || sOp == '^-') {
                            unary = (unary << 2) | 2;
                            continue;
                        }
                        if (sOp == '^L') {
                            unary = (unary << 2) | 3;
                            continue;
                        }
                    }
                    fError = true;
                    break;
                }
            }

            if (v === undefined) {
                if (aUndefined) {
                    aUndefined.push(sValue);
                    v = 0;
                } else {
                    fError = true;
                    // aUndefined = [];
                    break;
                }
            }

            aVals.push(this.truncate(v));

            /*
             * When parseExpression() calls us, it has collapsed all runs of whitespace into single spaces,
             * and although it allows single spaces to divide the elements of the expression, a space is neither
             * a unary nor binary operator.  It's essentially a no-op.  If we encounter it here, then it followed
             * a value, and since we don't want to misinterpret the next operator as a unary operator, we look
             * ahead and grab the next operator if it's not preceded by a value.
             */
            if (sOp == ' ') {
                if (iValue < asValues.length - 1 && !asValues[iValue]) {
                    iValue++;
                    sOp = asValues[iValue++]
                } else {
                    fError = true;
                    break;
                }
            }

            if (!sOp) break;

            let aBinOp = (this.achGroup[0] == '<'? DbgIO.DECOP_PRECEDENCE : DbgIO.BINOP_PRECEDENCE);
            if (!aBinOp[sOp]) {
                fError = true;
                break;
            }
            if (aOps.length && aBinOp[sOp] <= aBinOp[aOps[aOps.length - 1]]) {
                this.evalOps(aVals, aOps, 1);
            }
            aOps.push(sOp);

            /*
             * The MACRO-10 binary shifting operator assumes a base-10 shift count, regardless of the current
             * base, so we must override the current base to ensure the count is parsed correctly.
             */
            this.nDefaultBase = (sOp == '^_')? 10 : nBase;
            unary = 0;
        }

        if (fError || !this.evalOps(aVals, aOps) || aVals.length != 1) {
            fError = true;
        }

        if (!fError) {
            value = aVals.pop();
            this.assert(!aVals.length);
        } else if (!aUndefined) {
            this.printf("parse error (%s)\n", (sValue || sOp));
        }

        this.nDefaultBase = nBasePrev;
        return value;
    }

    /**
     * parseASCII(expr, chDelim, nBits)
     *
     * @this {DbgIO}
     * @param {string} expr
     * @param {string} chDelim
     * @param {number} nBits (number of bits to store for each ASCII character)
     * @return {string|undefined}
     */
    parseASCII(expr, chDelim, nBits)
    {
        let i;
        let cchMax = (this.nDefaultBits / nBits)|0;
        while ((i = expr.indexOf(chDelim)) >= 0) {
            let v = 0;
            let j = i + 1;
            let cch = cchMax;
            while (j < expr.length) {
                let ch = expr[j++];
                if (ch == chDelim) {
                    cch = -1;
                    break;
                }
                if (!cch) break;
                cch--;
                let c = ch.charCodeAt(0);
                if (nBits == 6) {
                    c -= 0x20;
                }
                c &= ((1 << nBits) - 1);
                v = this.truncate(v * Math.pow(2, nBits) + c, nBits * cchMax, true);
            }
            if (cch >= 0) {
                this.printf("parse error (%c%s%c)\n", chDelim, expr, chDelim);
                return undefined;
            } else {
                expr = expr.substr(0, i) + this.toBase(v) + expr.substr(j);
            }
        }
        return expr;
    }

    /**
     * parseExpression(expr, aUndefined)
     *
     * A quick-and-dirty expression parser.  It takes an expression like:
     *
     *      EDX+EDX*4+12345678
     *
     * and builds a value stack in aVals and a "binop" (binary operator) stack in aOps:
     *
     *      aVals       aOps
     *      -----       ----
     *      EDX         +
     *      EDX         *
     *      4           +
     *      ...
     *
     * We pop 1 "binop" from aOps and 2 values from aVals whenever a "binop" of lower priority than its
     * predecessor is encountered, evaluate, and push the result back onto aVals.  Only selected unary
     * operators are supported (eg, negate and complement); no ternary operators like '?:' are supported.
     *
     * aUndefined can be used to pass an array that collects any undefined variables that parseExpression()
     * encounters; the value of an undefined variable is zero.  This mode was added for components that need
     * to support expressions containing "fixups" (ie, values that must be determined later).
     *
     * @this {DbgIO}
     * @param {string|undefined} expr
     * @param {Array} [aUndefined] (collects any undefined variables)
     * @return {number|undefined} numeric value, or undefined if expr contains any undefined or invalid values
     */
    parseExpression(expr, aUndefined)
    {
        let value;
        if (expr) {
            /*
             * The default delimiting characters for grouped expressions are braces; they can be changed by altering
             * achGroup, but when that happens, instead of changing our regular expressions and operator tables,
             * we simply replace all achGroup characters with braces in the given expression.
             *
             * Why not use parentheses for grouped expressions?  Because some debuggers use parseReference() to perform
             * parenthetical value replacements in message strings, and they don't want parentheses taking on a different
             * meaning.  And for some machines, like the PDP-10, the convention is to use parentheses for other things,
             * like indexed addressing, and to use angle brackets for grouped expressions.
             */
            if (this.achGroup[0] != '{') {
                expr = expr.split(this.achGroup[0]).join('{').split(this.achGroup[1]).join('}');
            }

            /*
             * Quoted ASCII characters can have a numeric value, too, which must be converted now, to avoid any
             * conflicts with the operators below.
             *
             * NOTE: MACRO-10 packs up to 5 7-bit ASCII codes from a double-quoted value, and up to 6 6-bit ASCII
             * (SIXBIT) codes from a sinqle-quoted value.
             */
            expr = this.parseASCII(expr, '"', this.nASCIIBits);
            if (!expr) return value;
            expr = this.parseASCII(expr, "'", 6);
            if (!expr) return value;

            /*
             * All browsers (including, I believe, IE9 and up) support the following idiosyncrasy of a RegExp split():
             * when the RegExp uses a capturing pattern, the resulting array will include entries for all the pattern
             * matches along with the non-matches.  This effectively means that, in the set of expressions that we
             * support, all even entries in asValues will contain "values" and all odd entries will contain "operators".
             *
             * Although I started listing the operators in the RegExp in "precedential" order, that's not important;
             * what IS important is listing operators that contain shorter operators first.  For example, bitwise
             * shift operators must be listed BEFORE the logical less-than or greater-than operators.  The aBinOp tables
             * (BINOP_PRECEDENCE and DECOP_PRECEDENCE) are what determine precedence, not the RegExp.
             *
             * Also, to better accommodate MACRO-10 syntax, I've replaced the single '^' for XOR with '^!', and I've
             * added '!' as an alias for '|' (bitwise inclusive-or), '^-' as an alias for '~' (one's complement operator),
             * and '_' as a shift operator (+/- values specify a left/right shift, and the count is not limited to 32).
             *
             * And to avoid conflicts with MACRO-10 syntax, I've replaced the original mod operator ('%') with '^/'.
             *
             * The MACRO-10 binary shifting suffix ('B') is a bit more problematic, since a capital B can also appear
             * inside symbols, or inside hex values.  So if the default base is NOT 16, then I pre-scan for that suffix
             * and replace all non-symbolic occurrences with an internal shift operator ('^_').
             *
             * Note that parseInt(), which parseValue() relies on, supports both the MACRO-10 base prefix overrides
             * and the binary shifting suffix ('B'), but since that suffix can also be a bracketed expression, we have to
             * support it here as well.
             *
             * MACRO-10 supports only a subset of all the PCjs operators; for example, MACRO-10 doesn't support any of
             * the boolean logical/compare operators.  But unless we run into conflicts, I prefer sticking with this
             * common set of operators.
             *
             * All whitespace in the expression is collapsed to single spaces, and space has been added to the list
             * of "operators", but its sole function is as a separator, not as an operator.  parseArray() will ignore
             * single spaces as long as they are preceded and/or followed by a "real" operator.  It would be dangerous
             * to remove spaces entirely, because if an operator-less expression like "A B" was passed in, we would want
             * that to generate an error; if we converted it to "AB", evaluation might inadvertently succeed.
             */
            let regExp = /({|}|\|\||&&|\||\^!|\^B|\^O|\^D|\^L|\^-|~|\^_|_|&|!=|!|==|>=|>>>|>>|>|<=|<<|<|-|\+|\^\/|\/|\*|,,| )/;
            if (this.nDefaultBase != 16) {
                expr = expr.replace(/(^|[^A-Z0-9$%.])([0-9]+)B/, "$1$2^_").replace(/\s+/g, ' ');
            }
            let asValues = expr.split(regExp);
            value = this.parseArray(asValues, 0, asValues.length, this.nDefaultBase, aUndefined);
        }
        return value;
    }

    /**
     * parseUnary(value, unary)
     *
     * unary is actually a small "stack" of unary operations encoded in successive pairs of bits.
     * As parseExpression() encounters each unary operator, unary is shifted left 2 bits, and the
     * new unary operator is encoded in bits 0 and 1 (0b00 is none, 0b01 is negate, 0b10 is complement,
     * and 0b11 is reserved).  Here, we process the bits in reverse order (hence the stack-like nature),
     * ensuring that we process the unary operators associated with this value right-to-left.
     *
     * Since bitwise operators see only 32 bits, more than 16 unary operators cannot be supported
     * using this method.  We'll let parseExpression() worry about that; if it ever happens in practice,
     * then we'll have to switch to a more "expensive" approach (eg, an actual array of unary operators).
     *
     * @this {DbgIO}
     * @param {number} value
     * @param {number} unary
     * @return {number}
     */
    parseUnary(value, unary)
    {
        while (unary) {
            let bit;
            switch(unary & 0o3) {
            case 1:
                value = -this.truncate(value);
                break;
            case 2:
                value = this.evalXOR(value, -1);        // this is easier than adding an evalNOT()...
                break;
            case 3:
                bit = 35;                               // simple left-to-right zero-bit-counting loop...
                while (bit >= 0 && !this.evalAND(value, Math.pow(2, bit))) bit--;
                value = 35 - bit;
                break;
            }
            unary >>>= 2;
        }
        return value;
    }

    /**
     * parseValue(sValue, sName, aUndefined, unary)
     *
     * @this {DbgIO}
     * @param {string} [sValue]
     * @param {string} [sName] is the name of the value, if any
     * @param {Array} [aUndefined]
     * @param {number} [unary] (0 for none, 1 for negate, 2 for complement, 3 for leading zeros)
     * @return {number|undefined} numeric value, or undefined if sValue is either undefined or invalid
     */
    parseValue(sValue, sName, aUndefined, unary = 0)
    {
        let value;
        if (sValue != undefined) {
            value = this.getRegister(sValue.toUpperCase());
            if (value == undefined) {
                value = this.getSymbol(sValue);
                if (value == undefined) {
                    value = this.getVariable(sValue);
                    if (value == undefined) {
                        /*
                         * A feature of MACRO-10 is that any single-digit number is automatically interpreted as base-10.
                         */
                        value = this.parseInt(sValue, sValue.length > 1 || this.nDefaultBase > 10? this.nDefaultBase : 10);
                    } else {
                        let sUndefined = this.getVariableFixup(sValue);
                        if (sUndefined) {
                            if (aUndefined) {
                                aUndefined.push(sUndefined);
                            } else {
                                let valueUndefined = this.parseExpression(sUndefined, aUndefined);
                                if (valueUndefined !== undefined) {
                                    value += valueUndefined;
                                } else {
                                    if (MAXDEBUG) this.printf("undefined %s: %s (%s)\n", (sName || "value"), sValue, sUndefined);
                                    value = undefined;
                                }
                            }
                        }
                    }
                }
            }
            if (value != undefined) {
                value = this.truncate(this.parseUnary(value, unary));
            } else {
                if (MAXDEBUG) this.printf("invalid %s: %s\n", (sName || "value"), sValue);
            }
        } else {
            if (MAXDEBUG) this.printf("missing %s\n", (sName || "value"));
        }
        return value;
    }

    /**
     * truncate(v, nBits, fUnsigned)
     *
     * @this {DbgIO}
     * @param {number} v
     * @param {number} [nBits]
     * @param {boolean} [fUnsigned]
     * @return {number}
     */
    truncate(v, nBits, fUnsigned)
    {
        let limit, vNew = v;
        nBits = nBits || this.nDefaultBits;

        if (fUnsigned) {
            if (nBits == 32) {
                vNew = v >>> 0;
            }
            else if (nBits < 32) {
                vNew = v & ((1 << nBits) - 1);
            }
            else {
                limit = Math.pow(2, nBits);
                if (v < 0 || v >= limit) {
                    vNew = v % limit;
                    if (vNew < 0) vNew += limit;
                }
            }
        }
        else {
            if (nBits <= 32) {
                vNew = (v << (32 - nBits)) >> (32 - nBits);
            }
            else {
                limit = Math.pow(2, nBits - 1);
                if (v >= limit) {
                    vNew = (v % limit);
                    if (((v / limit)|0) & 1) vNew -= limit;
                } else if (v < -limit) {
                    vNew = (v % limit);
                    if ((((-v - 1) / limit) | 0) & 1) {
                        if (vNew) vNew += limit;
                    }
                    else {
                        if (!vNew) vNew -= limit;
                    }
                }
            }
        }
        if (v != vNew) {
            if (MAXDEBUG) this.printf("warning: value %d truncated to %d\n", v, vNew);
            v = vNew;
        }
        return v;
    }

    /**
     * clearBreak(index)
     *
     * @this {DbgIO}
     * @param {number} index
     * @return {string}
     */
    clearBreak(index)
    {
        if (index < -1) {
            return this.enumBreak(this.clearBreak);
        }
        let isEmpty = function(aBreaks) {
            for (let i = 0; i < aBreaks.length; i++) {
                if (aBreaks[i] != undefined) return false;
            }
            return true;
        };
        let result = "";
        if (index >= 0) {
            let mapping = this.aBreakIndexes[index];
            if (mapping != undefined) {
                let type = mapping >> 8;
                let entry = mapping & 0xff;
                let bus = this.aBreakBuses[type];
                if (!bus) {
                    result = "invalid bus";
                } else {
                    let success;
                    let aBreakAddrs = this.aBreakAddrs[type];
                    let addr = aBreakAddrs[entry];
                    this.assert(addr != undefined, "no break address at index: %d\n", index);
                    if (addr >= NumIO.TWO_POW32) {
                        addr = (addr - NumIO.TWO_POW32)|0;
                    }
                    if (!(type & 1)) {
                        success = bus.untrapRead(addr, this.aBreakChecks[type]);
                    } else {
                        success = bus.untrapWrite(addr, this.aBreakChecks[type]);
                    }
                    if (success) {
                        aBreakAddrs[entry] = undefined;
                        this.aBreakIndexes[index] = undefined;
                        if (isEmpty(aBreakAddrs)) {
                            aBreakAddrs.length = 0;
                            if (isEmpty(this.aBreakIndexes)) {
                                this.aBreakIndexes.length = 0;
                            }
                        }
                        result = this.sprintf("%2d: %s %#0*x cleared\n", index, DbgIO.BREAKCMD[type], (bus.addrWidth >> 2)+2, addr);
                        if (!--this.cBreaks) {
                            if (!this.historyForced) result += this.enableHistory(false);
                        }
                        this.assert(this.cBreaks >= 0);
                    } else {
                        result = this.sprintf("invalid break address: %#0x\n", addr);
                    }
                }
            } else {
                result = this.sprintf("invalid break index: %d\n", index);
            }
        } else {
            result = "missing break index\n";
        }
        return result;
    }

    /**
     * enableBreak(index, enable)
     *
     * @this {DbgIO}
     * @param {number} index
     * @param {boolean} [enable]
     * @return {string}
     */
    enableBreak(index, enable = false)
    {
        if (index < -1) {
            return this.enumBreak(this.enableBreak, enable);
        }
        let result = "";
        if (index >= 0) {
            let mapping = this.aBreakIndexes[index];
            if (mapping != undefined) {
                let success = true;
                let type = mapping >> 8;
                let entry = mapping & 0xff;
                let aBreakAddrs = this.aBreakAddrs[type];
                let addr = aBreakAddrs[entry], addrPrint;
                if (addr != undefined) {
                    let action = enable? "enabled" : "disabled";
                    if (addr < NumIO.TWO_POW32) {
                        addrPrint = addr;
                        if (enable) {
                            success = false;
                        } else {
                            addr = (addr >>> 0) + NumIO.TWO_POW32;
                        }
                    } else {
                        addrPrint = (addr - NumIO.TWO_POW32)|0;
                        if (!enable) {
                            success = false;
                        } else {
                            addr = addrPrint;
                        }
                    }
                    let bus = this.aBreakBuses[type];
                    if (success) {
                        aBreakAddrs[entry] = addr;
                        result = this.sprintf("%2d: %s %#0*x %s\n", index, DbgIO.BREAKCMD[type], (bus.addrWidth >> 2)+2, addrPrint, action);
                    } else {
                        result = this.sprintf("%2d: %s %#0*x already %s\n", index, DbgIO.BREAKCMD[type], (bus.addrWidth >> 2)+2, addrPrint, action);
                    }
                } else {
                    /*
                     * TODO: This is really an internal error; this.assert() would be more appropriate than an error message
                     */
                    result = this.sprintf("no break address at index: %d\n", index);
                }
            } else {
                result = this.sprintf("invalid break index: %d\n", index);
            }
        } else {
            result = "missing break index\n";
        }
        return result;
    }

    /**
     * enumBreak(func, option)
     *
     * @param {function(number,(boolean|undefined))} func
     * @param {boolean} [option]
     * @return {string}
     */
    enumBreak(func, option)
    {
        let result = "";
        for (let index = 0; index < this.aBreakIndexes.length; index++) {
            if (this.aBreakIndexes[index] == undefined) continue;
            result += func.call(this, index, option);
        }
        if (!result) result = "no break addresses found";
        return result;
    }

    /**
     * listBreak(fCommands)
     *
     * @this {DbgIO}
     * @param {boolean} [fCommands] (true to generate a list of break commands for saveState())
     * @return {string}
     */
    listBreak(fCommands = false)
    {
        let result = "";
        for (let index = 0; index < this.aBreakIndexes.length; index++) {
            let mapping = this.aBreakIndexes[index];
            if (mapping == undefined) continue;
            let type = mapping >> 8;
            let entry = mapping & 0xff;
            let addr = this.aBreakAddrs[type][entry];
            let enabled = true;
            if (addr >= NumIO.TWO_POW32) {
                enabled = false;
                addr = (addr - NumIO.TWO_POW32)|0;
            }
            let bus = this.aBreakBuses[type];
            let command = this.sprintf("%s %#0*x", DbgIO.BREAKCMD[type], (bus.addrWidth >> 2)+2, addr);
            if (fCommands) {
                if (result) result += ';';
                result += command;
                if (!enabled) result += ";bd " + index;
            } else {
                result += this.sprintf("%2d: %s %s\n", index, command, enabled? "enabled" : "disabled");
            }
        }
        if (!result) {
            if (!fCommands) result = "no break addresses found\n";
        }
        return result;
    }

    /**
     * setBreak(address, type)
     *
     * @this {DbgIO}
     * @param {Address} [address]
     * @param {number} [type] (default is BREAKTYPE.READ)
     * @return {string}
     */
    setBreak(address, type = DbgIO.BREAKTYPE.READ)
    {
        let dbg = this;
        let result = "";

        /**
         * addBreakAddr(aBreakAddrs, address)
         *
         * @param {Array} aBreakAddrs
         * @param {Address} address
         * @return {number} (>= 0 if added, < 0 if not)
         */
        let addBreakAddr = function(aBreakAddrs, address) {
            let entry = aBreakAddrs.indexOf(address.off);
            if (entry < 0) entry = aBreakAddrs.indexOf((address.off >>> 0) + NumIO.TWO_POW32);
            if (entry >= 0) {
                entry = -(entry + 1);
            } else {
                for (entry = 0; entry < aBreakAddrs.length; entry++) {
                    if (aBreakAddrs[entry] == undefined) break;
                }
                aBreakAddrs[entry] = address.off;
            }
            return entry;
        };

        /**
         * addBreakIndex(type, entry)
         *
         * @param {number} type
         * @param {number} entry
         * @return {number} (new index)
         */
        let addBreakIndex = function(type, entry) {
            let index;
            for (index = 0; index < dbg.aBreakIndexes.length; index++) {
                if (dbg.aBreakIndexes[index] == undefined) break;
            }
            dbg.aBreakIndexes[index] = (type << 8) | entry;
            return index;
        };

        if (address) {
            let success;
            let bus = this.aBreakBuses[type];
            if (!bus) {
                result = "invalid bus";
            } else {
                let entry = addBreakAddr(this.aBreakAddrs[type], address);
                if (entry >= 0) {
                    if (!(type & 1)) {
                        success = bus.trapRead(address.off, this.aBreakChecks[type]);
                    } else {
                        success = bus.trapWrite(address.off, this.aBreakChecks[type]);
                    }
                    if (success) {
                        let index = addBreakIndex(type, entry);
                        result = this.sprintf("%2d: %s %#0*x set\n", index, DbgIO.BREAKCMD[type], (bus.addrWidth >> 2)+2, address.off);
                        if (!this.cBreaks++) {
                            if (!this.historyBuffer.length) result += this.enableHistory(true);
                        }
                    } else {
                        result = this.sprintf("invalid break address: %#0x\n", address.off);
                        this.aBreakAddrs[type][entry] = undefined;
                    }
                } else {
                    result = this.sprintf("%s %#0x already set\n", DbgIO.BREAKCMD[type], address.off);
                }
            }
        } else {
            result = "missing break address\n";
        }
        return result;
    }

    /**
     * setBreakCounter(n)
     *
     * Set number of instructions to execute before breaking.
     *
     * @this {DbgIO}
     * @param {number} n (-1 if no number was supplied, so just display current counter)
     * @return {string}
     */
    setBreakCounter(n)
    {
        let result = "";
        if (n >= 0) this.counterBreak = n;
        result += "instruction break count: " + (this.counterBreak > 0? this.counterBreak : "disabled") + "\n";
        if (n > 0) {
            /*
             * It doesn't hurt to always call enableHistory(), but avoiding the call minimizes unnecessary messages.
             */
            if (!this.historyBuffer.length) result += this.enableHistory(true);
            this.historyForced = true;
        }
        return result;
    }

    /**
     * setBreakMessage(token)
     *
     * Set message(s) to break on when we are notified of being printed.
     *
     * @this {DbgIO}
     * @param {string} token
     * @return {string}
     */
    setBreakMessage(token)
    {
        let result;
        if (token) {
            let on = this.parseBoolean(token);
            if (on != undefined) {
                this.messagesBreak = on? MESSAGE.ALL : MESSAGE.NONE;
            } else {
                result = this.sprintf("unrecognized message option: %s\n", token);
            }
        }
        if (!result) {
            result = this.sprintf("break on message: %b\n", !!this.messagesBreak);
        }
        return result;
    }

    /**
     * checkBusInput(base, offset, value)
     *
     * @this {DbgIO}
     * @param {number|undefined} base
     * @param {number} offset
     * @param {number} value
     */
    checkBusInput(base, offset, value)
    {
        if (this.cBreakIgnore) return;
        if (base == undefined) {
            this.stopCPU(this.sprintf("break on unknown input %#0x: %#0x", offset, value));
        } else {
            let addr = base + offset;
            if (this.aBreakAddrs[DbgIO.BREAKTYPE.INPUT].indexOf(addr) >= 0) {
                this.stopCPU(this.sprintf("break on input %#0x: %#0x", addr, value));
            }
        }
    }

    /**
     * checkBusOutput(base, offset, value)
     *
     * @this {DbgIO}
     * @param {number|undefined} base
     * @param {number} offset
     * @param {number} value
     */
    checkBusOutput(base, offset, value)
    {
        if (this.cBreakIgnore) return;
        if (base == undefined) {
            this.stopCPU(this.sprintf("break on unknown output %#0x: %#0x", offset, value));
        } else {
            let addr = base + offset;
            if (this.aBreakAddrs[DbgIO.BREAKTYPE.OUTPUT].indexOf(addr) >= 0) {
                this.stopCPU(this.sprintf("break on output %#0x: %#0x", addr, value));
            }
        }
    }

    /**
     * checkBusRead(base, offset, value)
     *
     * If historyBuffer has been allocated, then we need to record all instruction fetches, which we
     * distinguish as reads where the physical address matches cpu.getPCLast().
     *
     * TODO: Additional logic will be required for machines where the logical PC differs from the physical
     * address (eg, machines with segmentation or paging enabled), but that's an issue for another day.
     *
     * @this {DbgIO}
     * @param {number|undefined} base
     * @param {number} offset
     * @param {number} value
     */
    checkBusRead(base, offset, value)
    {
        if (this.cBreakIgnore) return;
        if (base == undefined) {
            this.stopCPU(this.sprintf("break on unknown read %#0x: %#0x", offset, value));
        } else {
            let addr = base + offset;
            if (this.historyBuffer.length) {
                let lastPC = this.cpu.getPCLast();
                if (this.counterBreak > 0 && addr == lastPC) {
                    if (!--this.counterBreak) {
                        this.stopCPU(this.sprintf("break on instruction count"));
                    }
                }
                if (!((addr - lastPC) & ~0x3)) {
                    this.historyBuffer[this.historyNext++] = addr;
                    if (this.historyNext == this.historyBuffer.length) this.historyNext = 0;
                }
            }
            if (this.aBreakAddrs[DbgIO.BREAKTYPE.READ].indexOf(addr) >= 0) {
                this.stopCPU(this.sprintf("break on read %#0x: %#0x", addr, value));
            }
        }
    }

    /**
     * checkBusWrite(base, offset, value)
     *
     * @this {DbgIO}
     * @param {number|undefined} base
     * @param {number} offset
     * @param {number} value
     */
    checkBusWrite(base, offset, value)
    {
        if (this.cBreakIgnore) return;
        if (base == undefined) {
            this.stopCPU(this.sprintf("break on unknown write %#0x: %#0x", offset, value));
        } else {
            let addr = base + offset;
            if (this.aBreakAddrs[DbgIO.BREAKTYPE.WRITE].indexOf(addr) >= 0) {
                this.stopCPU(this.sprintf("break on write %#0x: %#0x", addr, value));
            }
        }
    }

    /**
     * stopCPU(message)
     *
     * @this {DbgIO}
     * @param {string} message
     */
    stopCPU(message)
    {
        if (this.time.isRunning() && this.fExceptionOnBreak) {
            /*
             * We don't print the message in this case, because the CPU's exception handler already
             * does that; it has to be prepared for any kind of exception, not just those that we throw.
             */
            throw new Error(message);
        }
        this.println(message);
        this.time.stop();
    }

    /**
     * dumpAddress(address)
     *
     * All this function currently supports are physical (Bus) addresses, but that will change.
     *
     * @this {DbgIO}
     * @param {Address} address
     * @return {string}
     */
    dumpAddress(address)
    {
        return this.toBase(address.off, this.nDefaultBase, this.busMemory.addrWidth, "");
    }

    /**
     * dumpHistory(index)
     *
     * The index parameter is interpreted as the number of instructions to rewind; if you also
     * specify a length, then that limits the number of instructions to display from the index point.
     *
     * @this {DbgIO}
     * @param {number} index
     * @param {number} [length]
     * @return {string}
     */
    dumpHistory(index, length = 10)
    {
        let result = "";
        if (this.historyBuffer.length) {
            if (index < 0) index = length;
            let i = this.historyNext - index;
            if (i < 0) i += this.historyBuffer.length;
            let address, opcodes = [];
            while (i >= 0 && i < this.historyBuffer.length && length > 0) {
                let addr = this.historyBuffer[i++];
                if (i == this.historyBuffer.length) {
                    if (result) break;      // wrap around only once
                    i = 0;
                }
                if (addr == undefined && !opcodes.length) continue;
                if (!address) address = this.newAddress(addr);
                if (addr != address.off || opcodes.length == this.maxOpLength) {
                    this.addAddress(address, -opcodes.length);
                    result += this.unassemble(address, opcodes);
                    length--;
                }
                if (addr == undefined) continue;
                address.off = addr;
                opcodes.push(this.readAddress(address, 1));
            }
        }
        return result || "no history";
    }

    /**
     * dumpInstruction(address, length)
     *
     * @param {Address|number} address
     * @param {number} length
     * @return {string}
     */
    dumpInstruction(address, length)
    {
        let opcodes = [], result = "";
        address = this.makeAddress(address);
        while (length--) {
            this.addAddress(address, opcodes.length);
            while (opcodes.length < this.maxOpLength) {
                opcodes.push(this.readAddress(address, 1));
            }
            this.addAddress(address, -opcodes.length);
            result += this.unassemble(address, opcodes);
        }
        return result;
    }

    /**
     * dumpMemory(address, bits, length, format)
     *
     * @param {Address} [address] (default is addressPrev; advanced by the length of the dump)
     * @param {number} [bits] (default size is the memory bus data width; e.g., 8 bits)
     * @param {number} [length] (default length of dump is 128 values)
     * @param {string} [format] (formatting options; only 'y' for binary output is currently supported)
     * @return {string}
     */
    dumpMemory(address, bits, length, format)
    {
        let result = "";
        if (!bits) bits = this.busMemory.dataWidth;
        let size = bits >> 3;
        if (!length) length = 128;
        let fASCII = false, cchBinary = 0;
        let cLines = ((length + 15) >> 4) || 1;
        let cbLine = (size == 4? 16 : this.nDefaultBase);
        if (format == 'y') {
            cbLine = size;
            cLines = length;
            cchBinary = size * 8;
        }
        if (!address) address = this.addressPrev;
        while (cLines-- && length > 0) {
            let data = 0, iByte = 0, i;
            let sData = "", sChars = "";
            let sAddress = this.dumpAddress(address);
            for (i = cbLine; i > 0 && length > 0; i--) {
                let b = this.readAddress(address, 1);
                data |= (b << (iByte++ << 3));
                if (iByte == size) {
                    sData += this.toBase(data, 0, bits, "");
                    sData += (size == 1? (i == 9? '-' : ' ') : " ");
                    if (cchBinary) sChars += this.toBase(data, 2, bits, "");
                    data = iByte = 0;
                }
                if (!cchBinary) sChars += (b >= 32 && b < 127? String.fromCharCode(b) : (fASCII? '' : '.'));
                length--;
            }
            if (result) result += '\n';
            if (fASCII) {
                result += sChars;
            } else {
                result += sAddress + "  " + sData + " " + sChars;
            }
        }
        this.addressPrev = address;
        return result;
    }

    /**
     * dumpState()
     *
     * Simulate what the Machine class does to obtain the current state of the entire machine.
     *
     * @return {string}
     */
    dumpState()
    {
        let state = [];
        this.enumDevices(function enumDevice(device) {
            if (device.onSave) device.onSave(state);
            return true;
        });
        return JSON.stringify(state, null, 2);
    }

    /**
     * editMemory(address, values)
     *
     * @param {Address|undefined} address
     * @param {Array.<number>} values
     * @return {string}
     */
    editMemory(address, values)
    {
        let count = 0, result = "";
        for (let i = 0; address != undefined && i < values.length; i++) {
            let prev = this.readAddress(address);
            if (prev == undefined) break;
            this.writeAddress(address, values[i]);
            result += this.sprintf("%#06x: %#0x changed to %#0x\n", address.off, prev, values[i]);
            this.addAddress(address, 1);
            count++;
        }
        if (!count) result += this.sprintf("%d locations updated\n", count);
        this.time.update();
        return result;
    }

    /**
     * enableHistory(enable)
     *
     * History refers to instruction execution history, which means we want to trap every read where
     * the requested address is at or near regPC.  So if history is being enabled, we preallocate an array
     * to record every such physical address.
     *
     * The upside to this approach is that no special hooks are required inside the CPU, since we are
     * simply leveraging the Bus' ability to use different read handlers for all ROM and RAM blocks.  The
     * downside is that we're recording the address of *every* byte of every instruction, not just that
     * of the *first* byte; however, dumpHistory() can compensate for that, by skipping all the bytes
     * that unassemble() processes.
     *
     * @this {DbgIO}
     * @param {boolean} [enable] (if undefined, then we simply return the current history status)
     * @return {string}
     */
    enableHistory(enable)
    {
        let result = "";
        if (enable != undefined) {
            if (enable == !this.historyBuffer.length) {
                let dbg = this, cBlocks = 0;
                cBlocks += this.busMemory.enumBlocks(Memory.TYPE.READABLE, function(block) {
                    if (enable) {
                        dbg.busMemory.trapRead(block.addr, dbg.aBreakChecks[DbgIO.BREAKTYPE.READ]);
                    } else {
                        dbg.busMemory.untrapRead(block.addr, dbg.aBreakChecks[DbgIO.BREAKTYPE.READ]);
                    }
                });
                if (cBlocks) {
                    if (enable) {
                        this.historyNext = 0;
                        this.historyBuffer = new Array(DbgIO.HISTORY_LIMIT);
                    } else {
                        this.historyBuffer = [];
                    }
                }
            }
        }
        result += this.sprintf("instruction history %s\n", this.historyBuffer.length? "enabled" : "disabled");
        return result;
    }

    /**
     * loadState(state)
     *
     * @this {DbgIO}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.parseCommands(state.shift());
            this.machine.messages = state.shift();
            return true;
        }
        return false;
    }

    /**
     * notifyMessage(messages)
     *
     * Provides the Debugger with a notification whenever a message is being printed, along with the messages bits;
     * if any of those bits are set in messagesBreak, we break (ie, we stop the CPU).
     *
     * @this {DbgIO}
     * @param {number} messages
     */
    notifyMessage(messages)
    {
        if (this.testBits(this.messagesBreak, messages)) {
            this.stopCPU(this.sprintf("break on message"));
        }
    }

    /**
     * onCommand(aTokens)
     *
     * Processes basic debugger commands.
     *
     * @this {DbgIO}
     * @param {Array.<string>} aTokens ([0] contains the entire command line; [1] and up contain tokens from the command)
     * @return {string|undefined}
     */
    onCommand(aTokens)
    {
        let expr, result = "", name, values = [];
        let cmd = aTokens[1], index, address, bits, length, enable;

        if (aTokens[2] == '*') {
            index = -2;
        } else {
            index = this.parseInt(aTokens[2]);
            if (index == undefined) index = -1;
            address = this.parseAddress(aTokens[2]);
            if (address === null) return undefined;
        }
        length = 0;
        if (aTokens[3]) {
            length = this.parseInt(aTokens[3].substr(aTokens[3][0] == 'l'? 1 : 0)) || 8;
        }
        for (let i = 3; i < aTokens.length; i++) {
            values.push(this.parseInt(aTokens[i], 16));
        }

        switch(cmd[0]) {
        case 'b':
            if (cmd[1] == 'c') {
                result = this.clearBreak(index);
            } else if (cmd[1] == 'd') {
                result = this.enableBreak(index);
            } else if (cmd[1] == 'e') {
                result = this.enableBreak(index, true);
            } else if (cmd[1] == 'i') {
                result = this.setBreak(address, DbgIO.BREAKTYPE.INPUT);
            } else if (cmd[1] == 'l') {
                result = this.listBreak();
            } else if (cmd[1] == 'm') {
                result = this.setBreakMessage(aTokens[2]);
            } else if (cmd[1] == 'n') {
                result = this.setBreakCounter(index);
            } else if (cmd[1] == 'o') {
                result = this.setBreak(address, DbgIO.BREAKTYPE.OUTPUT);
            } else if (cmd[1] == 'r') {
                result = this.setBreak(address, DbgIO.BREAKTYPE.READ);
            } else if (cmd[1] == 'w') {
                result = this.setBreak(address, DbgIO.BREAKTYPE.WRITE);
            } else {
                result = "break commands:\n";
                DbgIO.BREAK_COMMANDS.forEach((cmd) => {result += cmd + '\n';});
                break;
            }
            break;

        case 'd':
            if (cmd[1] == 'b' || !cmd[1]) {
                bits = 8;
            } else if (cmd[1] == 'w') {
                bits = 16;
            } else if (cmd[1] == 'd') {
                bits = 32;
            } else if (cmd[1] == 'h') {
                result = this.dumpHistory(index);
                break;
            } else if (cmd[1] == 's') {
                result = this.dumpState();
                break;
            } else {
                result = "dump commands:\n";
                DbgIO.DUMP_COMMANDS.forEach((cmd) => {result += cmd + '\n';});
                break;
            }
            result = this.dumpMemory(address, bits, length, cmd[2]);
            break;

        case 'e':
            result = this.editMemory(address, values);
            break;

        case 'g':
            if (this.time.start()) {
                if (address != undefined) this.setBreak(address);
                if (this.input) this.input.setFocus();
            } else {
                result = "already started\n";
            }
            break;

        case 'h':
            if (!this.time.stop()) result = "already stopped\n";
            break;

        case 'p':
            aTokens.shift();
            aTokens.shift();
            expr = aTokens.join(' ');
            result += this.sprintf("%s = %s\n", expr, this.toBase(this.parseExpression(expr)));
            break;

        case 'r':
            name = cmd.substr(1).toUpperCase();
            if (name) {
                if (this.cpu.getRegister(name) == undefined) {
                    result += this.sprintf("unrecognized register: %s\n", name);
                    break;
                }
                if (address != undefined) this.cpu.setRegister(name, address.off);
            }
            result += this.cpu.toString();
            break;

        case 's':
            enable = this.parseBoolean(aTokens[2]);
            if (cmd[1] == 'h') {
                /*
                 * Don't let the user turn off history if any breakpoints (which may depend on history) are still set.
                 */
                if (this.cBreaks || this.counterBreak > 0) {
                    enable = undefined;     // this ensures enableHistory() will simply return the status, not change it.
                }
                result = this.enableHistory(enable);
                if (enable != undefined) this.historyForced = enable;
            } else {
                result = "set commands:\n";
                DbgIO.SET_COMMANDS.forEach((cmd) => {result += cmd + '\n';});
                break;
            }
            break;

        case 't':
            length = this.parseInt(aTokens[2], 10) || 1;
            this.time.onStep(length);
            break;

        case 'u':
            if (!length) length = 8;
            if (!address) address = this.addressPrev;
            result += this.dumpInstruction(address, length);
            this.addressPrev = address;
            break;

        case '?':
            result = "debugger commands:\n";
            DbgIO.COMMANDS.forEach((cmd) => {result += cmd + '\n';});
            break;

        default:
            result = undefined;
            break;
        }

        if (result == undefined && aTokens[0]) {
            result = "unrecognized command '" + aTokens[0] + "' (try '?')\n";
        }

        return result;
    }

    /**
     * onLoad(state)
     *
     * Automatically called by the Machine device if the machine's 'autoSave' property is true.
     *
     * @this {DbgIO}
     * @param {Array} state
     * @return {boolean}
     */
    onLoad(state)
    {
        if (state) {
            let stateDbg = state[0];
            if (this.loadState(stateDbg)) {
                state.shift();
                return true;
            }
        }
        return false;
    }

    /**
     * onSave(state)
     *
     * Automatically called by the Machine device before all other devices have been powered down (eg, during
     * a page unload event).
     *
     * @this {DbgIO}
     * @param {Array} state
     */
    onSave(state)
    {
        let stateDbg = [];
        this.saveState(stateDbg);
        state.push(stateDbg);
    }

    /**
     * saveState(stateDbg)
     *
     * @this {DbgIO}
     * @param {Array} stateDbg
     */
    saveState(stateDbg)
    {
        stateDbg.push(this.idDevice);
        stateDbg.push(this.listBreak(true));
        stateDbg.push(this.machine.messages);
    }

    /**
     * setFocus()
     *
     * @this {DbgIO}
     */
    setFocus()
    {
        let element = this.findBinding(WebIO.BINDING.PRINT, true);
        if (element) element.focus();
    }

    /**
     * unassemble(address, opcodes)
     *
     * Returns a string representation of the selected instruction.  Since all processor-specific code
     * should be in the overriding function, all we can do here is display the address and an opcode.
     *
     * @this {DbgIO}
     * @param {Address} address (advanced by the number of processed opcodes)
     * @param {Array.<number>} opcodes (each processed opcode is shifted out, reducing the size of the array)
     * @return {string}
     */
    unassemble(address, opcodes)
    {
        let dbg = this;
        let getNextOp = function() {
            let op = opcodes.shift();
            dbg.addAddress(address, 1);
            return op;
        };
        let sAddress = this.dumpAddress(address);
        return this.sprintf("%s %02x         unsupported\n", sAddress, getNextOp());
    }

    /**
     * updateDebugger(fTransition)
     *
     * @this {DbgIO}
     * @param {boolean} [fTransition]
     */
    updateDebugger(fTransition)
    {
        if (fTransition) {
            if (!this.time.isRunning()) {
                this.cpu.print(this.cpu.toString());
                this.setFocus();
            }
        }
    }
}

DbgIO.COMMANDS = [
    "b?\t\tbreak commands",
    "d?\t\tdump commands",
    "e [addr] ...\tedit memory",
    "g [addr]\trun (to addr)",
    "h\t\thalt",
    "p [expr]\tparse expression",
    "r? [value]\tdisplay/set registers",
    "s?\t\tset commands",
    "t [n]\t\tstep (n instructions)",
    "u [addr] [n]\tunassemble (at addr)"
];

DbgIO.BREAK_COMMANDS = [
    "bc [n|*]\tclear break address",
    "bd [n|*]\tdisable break address",
    "be [n|*]\tenable break address",
    "bl [n]\t\tlist break addresses",
    "bi [addr]\tbreak on input",
    "bo [addr]\tbreak on output",
    "br [addr]\tbreak on read",
    "bw [addr]\tbreak on write",
    "bm [on|off]\tbreak on message",
    "bn [count]\tbreak on instruction count"
];

DbgIO.DUMP_COMMANDS = [
    "db  [addr]\tdump bytes (8 bits)",
    "dw  [addr]\tdump words (16 bits)",
    "dd  [addr]\tdump dwords (32 bits)",
    "d*y [addr]\tdump values in binary",
    "dh  [n] [l]\tdump instruction history buffer",
    "ds\t\tdump machine state"
];

DbgIO.SET_COMMANDS = [
    "sh [on|off]\tset instruction history"
];

DbgIO.ADDRESS = {
    LINEAR:     0x01,           // if seg is -1, this indicates if the address is physical (clear) or linear (set)
    PHYSICAL:   0x00,
    PROTECTED:  0x02,           // if seg is NOT -1, this indicates if the address is real (clear) or protected (set)
    REAL:       0x00
};

/*
 * The required characteristics of these assigned values are as follows: all even values must be read
 * operations and all odd values must be write operations; all busMemory operations must come before all
 * busIO operations; and INPUT must be the first busIO operation.
 */
DbgIO.BREAKTYPE = {
    READ:       0,
    WRITE:      1,
    INPUT:      2,
    OUTPUT:     3
};

DbgIO.BREAKCMD = {
    [DbgIO.BREAKTYPE.READ]:     "br",
    [DbgIO.BREAKTYPE.WRITE]:    "bw",
    [DbgIO.BREAKTYPE.INPUT]:    "bi",
    [DbgIO.BREAKTYPE.OUTPUT]:   "bo"
};

/*
 * Predefined "virtual registers" that we expect the CPU to support.
 */
DbgIO.REGISTER = {
    PC:         "PC"            // the CPU's program counter
};

DbgIO.SYMBOL = {
    BYTE:       1,
    PAIR:       2,
    QUAD:       4,
    LABEL:      5,
    COMMENT:    6,
    VALUE:      7
};

DbgIO.SYMBOL_TYPES = {
    "=":        DbgIO.SYMBOL.VALUE,
    "1":        DbgIO.SYMBOL.BYTE,
    "2":        DbgIO.SYMBOL.PAIR,
    "4":        DbgIO.SYMBOL.QUAD,
    "@":        DbgIO.SYMBOL.LABEL,
    ";":        DbgIO.SYMBOL.COMMENT
};

DbgIO.HISTORY_LIMIT = 100000;

/*
 * These are our operator precedence tables.  Operators toward the bottom (with higher values) have
 * higher precedence.  BINOP_PRECEDENCE was our original table; we had to add DECOP_PRECEDENCE because
 * the precedence of operators in DEC's MACRO-10 expressions differ.  Having separate tables also allows
 * us to remove operators that shouldn't be supported, but unless some operator creates a problem,
 * I prefer to keep as much commonality between the tables as possible.
 *
 * Missing from these tables are the (limited) set of unary operators we support (negate and complement),
 * since this is only a BINARY operator precedence, not a general-purpose precedence table.  Assume that
 * all unary operators take precedence over all binary operators.
 */
DbgIO.BINOP_PRECEDENCE = {
    '||':   5,      // logical OR
    '&&':   6,      // logical AND
    '!':    7,      // bitwise OR (conflicts with logical NOT, but we never supported that)
    '|':    7,      // bitwise OR
    '^!':   8,      // bitwise XOR (added by MACRO-10 sometime between the 1972 and 1978 versions)
    '&':    9,      // bitwise AND
    '!=':   10,     // inequality
    '==':   10,     // equality
    '>=':   11,     // greater than or equal to
    '>':    11,     // greater than
    '<=':   11,     // less than or equal to
    '<':    11,     // less than
    '>>>':  12,     // unsigned bitwise right shift
    '>>':   12,     // bitwise right shift
    '<<':   12,     // bitwise left shift
    '-':    13,     // subtraction
    '+':    13,     // addition
    '^/':   14,     // remainder
    '/':    14,     // division
    '*':    14,     // multiplication
    '_':    19,     // MACRO-10 shift operator
    '^_':   19,     // MACRO-10 internal shift operator (converted from 'B' suffix form that MACRO-10 uses)
    '{':    20,     // open grouped expression (converted from achGroup[0])
    '}':    20      // close grouped expression (converted from achGroup[1])
};

DbgIO.DECOP_PRECEDENCE = {
    ',,':   1,      // high-word,,low-word
    '||':   5,      // logical OR
    '&&':   6,      // logical AND
    '!=':   10,     // inequality
    '==':   10,     // equality
    '>=':   11,     // greater than or equal to
    '>':    11,     // greater than
    '<=':   11,     // less than or equal to
    '<':    11,     // less than
    '>>>':  12,     // unsigned bitwise right shift
    '>>':   12,     // bitwise right shift
    '<<':   12,     // bitwise left shift
    '-':    13,     // subtraction
    '+':    13,     // addition
    '^/':   14,     // remainder
    '/':    14,     // division
    '*':    14,     // multiplication
    '!':    15,     // bitwise OR (conflicts with logical NOT, but we never supported that)
    '|':    15,     // bitwise OR
    '^!':   15,     // bitwise XOR (added by MACRO-10 sometime between the 1972 and 1978 versions)
    '&':    15,     // bitwise AND
    '_':    19,     // MACRO-10 shift operator
    '^_':   19,     // MACRO-10 internal shift operator (converted from 'B' suffix form that MACRO-10 uses)
    '{':    20,     // open grouped expression (converted from achGroup[0])
    '}':    20      // close grouped expression (converted from achGroup[1])
};

Defs.CLASSES["DbgIO"] = DbgIO;
