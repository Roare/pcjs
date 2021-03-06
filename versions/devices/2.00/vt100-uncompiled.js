"use strict";

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/defs.js (C) Jeff Parsons 2012-2019
 */

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

/*
 * RS-232 DB-25 Pin Definitions, mapped to bits 1-25 in a 32-bit status value.
 *
 * Serial devices in PCjs machines are considered DTE (Data Terminal Equipment), which means they should be "virtually"
 * connected to each other via a null-modem cable, which assumes the following cross-wiring:
 *
 *     G       1  <->  1        G       (Ground)
 *     TD      2  <->  3        RD      (Received Data)
 *     RD      3  <->  2        TD      (Transmitted Data)
 *     RTS     4  <->  5        CTS     (Clear To Send)
 *     CTS     5  <->  4        RTS     (Request To Send)
 *     DSR   6+8  <->  20       DTR     (Data Terminal Ready)
 *     SG      7  <->  7        SG      (Signal Ground)
 *     DTR    20  <->  6+8      DSR     (Data Set Ready + Carrier Detect)
 *     RI     22  <->  22       RI      (Ring Indicator)
 *
 * TODO: Move these definitions to a more appropriate shared file at some point.
 */
var RS232 = {
    RTS: {
        PIN:  4,
        MASK: 0x00000010
    },
    CTS: {
        PIN:  5,
        MASK: 0x00000020
    },
    DSR: {
        PIN:  6,
        MASK: 0x00000040
    },
    CD: {
        PIN:  8,
        MASK: 0x00000100
    },
    DTR: {
        PIN:  20,
        MASK: 0x00100000
    },
    RI: {
        PIN:  22,
        MASK: 0x00400000
    }
};

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

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/numio.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {NumIO}
 * @unrestricted
 */
class NumIO extends Defs {
    /**
     * NumIO()
     *
     * String to integer conversion:
     *
     *      isInt()
     *      parseInt()
     *
     * Integer to string conversion:
     *
     *      toBase()
     *
     * Bit operations (for values with more than 32 bits):
     *
     *      clearBits()
     *      setBits()
     *      testBits()
     *
     * Initially, this file was going to be called "stdlib.js", since the C runtime library file "stdlib.h"
     * defines numeric conversion functions like atoi().  But stdlib has too many other functions that have
     * nothing to do with data conversion, and we have many conversion functions that you won't find in stdlib.
     * So I settled on "numio.js" instead.
     *
     * @this {NumIO}
     */
    constructor()
    {
        super();
    }

    /**
     * isInt(s, base)
     *
     * The built-in parseInt() function has the annoying feature of returning a partial value (ie,
     * up to the point where it encounters an invalid character); eg, parseInt("foo", 16) returns 0xf.
     *
     * So it's best to use our own parseInt() function, which will in turn use this function to validate
     * the entire string.
     *
     * @this {NumIO}
     * @param {string} s is the string representation of some number
     * @param {number} [base] is the radix to use (default is 10); only 2, 8, 10 and 16 are supported
     * @return {boolean} true if valid, false if invalid (or the specified base isn't supported)
     */
    isInt(s, base)
    {
        if (!base || base == 10) return s.match(/^-?[0-9]+$/) !== null;
        if (base == 16) return s.match(/^-?[0-9a-f]+$/i) !== null;
        if (base == 8) return s.match(/^-?[0-7]+$/) !== null;
        if (base == 2) return s.match(/^-?[01]+$/) !== null;
        return false;
    }

    /**
     * parseDIPSwitches(sws, switchesDefault)
     *
     * @this {NumIO}
     * @param {string} sws (eg, "00000000", where sws[0] is DIP0, sws[1] is DIP1, etc.)
     * @param {number} [switchesDefault] (use -1 to parse sws as a mask: 0 for any non-digit character)
     * @return {number|undefined}
     */
    parseDIPSwitches(sws, switchesDefault)
    {
        let switches;
        if (!sws) {
            switches = switchesDefault;
        } else {
            /*
             * NOTE: It's not convenient to use parseInt() with a base of 2, in part because both bit order
             * and bit sense are reversed, but also because we use this function to parse switch masks, which
             * contain non-digits.  See the "switches" defined in invaders.json for examples.
             */
            switches = 0;
            let bit = 0x1;
            for (let i = 0; i < sws.length; i++) {
                let ch = sws.charAt(i);
                if (switchesDefault == -1) {
                    switches |= (ch != '0' && ch != '1'? 0 : bit);
                }
                else {
                    switches |= (ch == '0'? bit : 0);
                }
                bit <<= 1;
            }
        }
        return switches;
    }

    /**
     * parseInt(s, base)
     *
     * This is a wrapper around the built-in parseInt() function.  Our wrapper recognizes certain prefixes
     * ('$' or "0x" for hex, '#' or "0o" for octal) and suffixes ('.' for decimal, 'h' for hex, 'y' for
     * binary), and then calls isInt() to ensure we don't convert strings that contain partial values;
     * see isInt() for details.
     *
     * The use of multiple prefix/suffix combinations is undefined (although for the record, we process
     * prefixes first).  We do NOT support the "0b" prefix to indicate binary UNLESS one or more commas are
     * also present (because "0b" is also a valid hex sequence), and we do NOT support a single leading zero
     * to indicate octal (because such a number could also be decimal or hex).  Any number of commas are
     * allowed; we remove them all before calling the built-in parseInt().
     *
     * More recently, we've added support for "^D", "^O", and "^B" prefixes to accommodate the base overrides
     * that the PDP-10's MACRO-10 assembly language supports (decimal, octal, and binary, respectively).
     * If this support turns out to adversely affect other debuggers, then it will have to be "conditionalized".
     * Similarly, we've added support for "K", "M", and "G" MACRO-10-style suffixes that add 3, 6, or 9 zeros
     * to the value to be parsed, respectively.
     *
     * @this {NumIO}
     * @param {string} s is the string representation of some number
     * @param {number} [base] is the radix to use (default is 10); can be overridden by prefixes/suffixes
     * @return {number|undefined} corresponding value, or undefined if invalid
     */
    parseInt(s, base)
    {
        let value;

        if (s) {
            if (!base) base = 10;

            let ch, chPrefix, chSuffix;
            let fCommas = (s.indexOf(',') > 0);
            if (fCommas) s = s.replace(/,/g, '');

            ch = chPrefix = s.charAt(0);
            if (chPrefix == '#') {
                base = 8;
                chPrefix = '';
            }
            else if (chPrefix == '$') {
                base = 16;
                chPrefix = '';
            }
            if (ch != chPrefix) {
                s = s.substr(1);
            }
            else {
                ch = chPrefix = s.substr(0, 2);
                if (chPrefix == '0b' && fCommas || chPrefix == '^B') {
                    base = 2;
                    chPrefix = '';
                }
                else if (chPrefix == '0o' || chPrefix == '^O') {
                    base = 8;
                    chPrefix = '';
                }
                else if (chPrefix == '^D') {
                    base = 10;
                    chPrefix = '';
                }
                else if (chPrefix == '0x') {
                    base = 16;
                    chPrefix = '';
                }
                if (ch != chPrefix) s = s.substr(2);
            }
            ch = chSuffix = s.slice(-1);
            if (chSuffix == 'Y' || chSuffix == 'y') {
                base = 2;
                chSuffix = '';
            }
            else if (chSuffix == '.') {
                base = 10;
                chSuffix = '';
            }
            else if (chSuffix == 'H' || chSuffix == 'h') {
                base = 16;
                chSuffix = '';
            }
            else if (chSuffix == 'K') {
                chSuffix = '000';
            }
            else if (chSuffix == 'M') {
                chSuffix = '000000';
            }
            else if (chSuffix == 'G') {
                chSuffix = '000000000';
            }
            if (ch != chSuffix) s = s.slice(0, -1) + chSuffix;
            /*
             * This adds support for the MACRO-10 binary shifting (Bn) suffix, which must be stripped from the
             * number before parsing, and then applied to the value after parsing.  If n is omitted, 35 is assumed,
             * which is a net shift of zero.  If n < 35, then a left shift of (35 - n) is required; if n > 35, then
             * a right shift of -(35 - n) is required.
             */
            let v, shift = 0;
            if (base <= 10) {
                let match = s.match(/(-?[0-9]+)B([0-9]*)/);
                if (match) {
                    s = match[1];
                    shift = 35 - ((match[2] || 35) & 0xff);
                }
            }
            if (this.isInt(s, base) && !isNaN(v = parseInt(s, base))) {
                /*
                 * With the need to support larger (eg, 36-bit) integers, truncating to 32 bits is no longer helpful.
                 *
                 *      value = v|0;
                 */
                if (shift) {
                    /*
                     * Since binary shifting is a logical operation, and since shifting by division only works properly
                     * with positive numbers, we must convert a negative value to a positive value, by computing the two's
                     * complement.
                     */
                    if (v < 0) v += Math.pow(2, 36);
                    if (shift > 0) {
                        v *= Math.pow(2, shift);
                    } else {
                        v = Math.trunc(v / Math.pow(2, -shift));
                    }
                }
                value = v;
            }
        }
        return value;
    }

    /**
     * toBase(n, base, bits, prefix, nGrouping)
     *
     * Converts the given number (as an unsigned integer) to a string using the specified base (radix).
     *
     * sprintf() may be a better choice, depending on your needs (eg, signed integers, formatting options, etc.)
     * and support for the desired radix (eg, 8, 10, and 16).
     *
     * @this {NumIO}
     * @param {number|*} n
     * @param {number} [base] (ie, the radix; 0 or undefined for default)
     * @param {number} [bits] (the number of bits in the value, 0 for variable)
     * @param {string} [prefix] (prefix is based on radix; use "" for none)
     * @param {number} [nGrouping]
     * @return {string}
     */
    toBase(n, base, bits = 0, prefix = undefined, nGrouping = 0)
    {
        /*
         * We can't rely entirely on isNaN(), because isNaN(null) returns false, and we can't rely
         * entirely on typeof either, because typeof NaN returns "number".  Sigh.
         *
         * Alternatively, we could mask and shift n regardless of whether it's null/undefined/NaN,
         * since JavaScript coerces such operands to zero, but I think there's "value" in seeing those
         * values displayed differently.
         */
        let s = "", suffix = "", cch = -1;
        if (!base) base = this.nDefaultBase || 10;
        if (bits) cch = Math.ceil(bits / Math.log2(base));
        if (prefix == undefined) {
            switch(base) {
            case 8:
                prefix = "0o";
                break;
            case 16:
                prefix = "0x";
                break;
            case 10:
                suffix = ".";
                /* falls through */
            default:
                prefix = "";
                break;
            }
        }
        if (isNaN(n) || typeof n != "number") {
            n = undefined;
            prefix = suffix = "";
        } else {
            /*
             * Callers that produced an input by dividing by a power of two rather than shifting (in order
             * to access more than 32 bits) may produce a fractional result, which ordinarily we would simply
             * ignore, but if the integer portion is zero and the sign is negative, we should probably treat
             * this value as a sign-extension.
             */
            if (n < 0 && n > -1) n = -1;
            /*
             * Negative values should be twos-complemented to produce a positive value for conversion purposes,
             * but we can only do that if/when we're given the number of bits; Math.pow(base, cch) is equivalent
             * to Math.pow(2, bits), but less precise for bases that aren't a power of two (eg, base 10).
             */
            if (bits) {
                if (n < 0) {
                    n += Math.pow(2, bits);
                }
                if (n >= Math.pow(2, bits)) {
                    cch = Math.ceil(Math.log(n) / Math.log(base));
                }
            }
        }
        let g = nGrouping || -1;
        while (cch--) {
            if (!g) {
                s = ',' + s;
                g = nGrouping;
            }
            if (n == undefined) {
                s = '?' + s;
                if (cch < 0) break;
            } else {
                let d = n % base;
                n = Math.trunc(n / base);
                d += (d >= 0 && d <= 9? 0x30 : 0x41 - 10);
                s = String.fromCharCode(d) + s;
                if (!n && cch < 0) break;
            }
            g--;
        }
        return prefix + s + suffix;
    }

    /**
     * clearBits(num, bits)
     *
     * Function for clearing bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {number} (num & ~bits)
     */
    clearBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return (num & ~bits) + (numHi & ~bitsHi) * shift;
    }

    /**
     * setBits(num, bits)
     *
     * Function for setting bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {number} (num | bits)
     */
    setBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return (num | bits) + (numHi | bitsHi) * shift;
    }

    /**
     * testBits(num, bits)
     *
     * Function for testing bits in numbers with more than 32 bits.
     *
     * @this {NumIO}
     * @param {number} num
     * @param {number} bits
     * @return {boolean} (true IFF num & bits == bits)
     */
    testBits(num, bits)
    {
        let shift = NumIO.TWO_POW32;
        let numHi = (num / shift)|0;
        let bitsHi = (bits / shift)|0;
        return ((num & bits) == (bits|0) && (numHi & bitsHi) == bitsHi);
    }

    /**
     * compress(aSrc)
     *
     * Compresses an array of numbers.
     *
     * @this {NumIO}
     * @param {Array|Uint8Array} aSrc
     * @return {Array|Uint8Array} is either the original array (aSrc), or a smaller array of "count, value" pairs (aComp)
     */
    compress(aSrc)
    {
        let iSrc = 0;
        let iComp = 0;
        let aComp = [];
        while (iSrc < aSrc.length) {
            let n = aSrc[iSrc];

            let iCompare = iSrc + 1;
            while (iCompare < aSrc.length && aSrc[iCompare] === n) iCompare++;
            aComp[iComp++] = iCompare - iSrc;
            aComp[iComp++] = n;
            iSrc = iCompare;
        }
        if (aComp.length >= aSrc.length) return aSrc;
        return aComp;
    }

    /**
     * decompress(aComp, length)
     *
     * Decompresses an array of numbers.
     *
     * @this {NumIO}
     * @param {Array} aComp
     * @param {number} [length] (expected length of decompressed data)
     * @return {Array}
     */
    decompress(aComp, length = 0)
    {
        if (aComp.length == length) return aComp;
        let iDst = 0;
        let aDst = length? new Array(length) : [];
        let iComp = 0;
        while (iComp < aComp.length - 1) {
            let c = aComp[iComp++];
            let n = aComp[iComp++];
            while (c--) aDst[iDst++] = n;
        }

        return aDst;
    }
}

/*
 * Assorted constants
 */
NumIO.TWO_POW32 = Math.pow(2, 32);

Defs.CLASSES["NumIO"] = NumIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/stdio.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {StdIO}
 * @unrestricted
 */
class StdIO extends NumIO {
    /**
     * StdIO()
     *
     * Summary of functions:
     *
     *      flush()
     *      isDate()
     *      parseDate()
     *      print()
     *      printf()
     *      println()
     *      sprintf()
     *      toHex()
     *
     * This class is called "StdIO" rather than "stdio" because classes are global entities and I prefer global
     * entities to begin with a capital letter and use camelCase.  And its methods are primarily object functions
     * rather than class functions, because the parent objects are typically Device objects which may wish to have
     * unique "print" bindings.  Mingling every object's print output in the same container may not be desired.
     *
     * The filename "stdio.js" is inspired by the C runtime library file "stdio.h", since it includes printf()
     * and sprintf() functions that have many C-like features, but they also have many differences (both additions
     * and omissions).  And you will find other functions here that have no counterpart in "stdio.h", so don't take
     * the name too seriously.
     *
     * @this {StdIO}
     */
    constructor()
    {
        super();
    }

    /**
     * flush()
     *
     * @this {StdIO}
     */
    flush()
    {
        let buffer = StdIO.PrintBuffer;
        StdIO.PrintBuffer = "";
        this.print(buffer);
    }

    /**
     * isDate(date)
     *
     * @this {StdIO}
     * @param {Date} date
     * @return {boolean}
     */
    isDate(date)
    {
        return !isNaN(date.getTime());
    }

    /**
     * parseDate(date)
     * parseDate(date, time)
     * parseDate(year, month, day, hour, minute, second)
     *
     * Produces a UTC date when ONLY a date (no time) is provided; otherwise, it combines the date and
     * and time, producing a date that is either UTC or local, depending on the presence (or lack) of time
     * zone information.  Finally, if numeric inputs are provided, then Date.UTC() is called to generate
     * a UTC time.
     *
     * In general, you should use this instead of new Date(s), because the Date constructor implicitly calls
     * Date.parse(s), which behaves inconsistently.  For example, ISO date-only strings (e.g. "1970-01-01")
     * generate a UTC time, but non-ISO date-only strings (eg, "10/1/1945" or "October 1, 1945") generate a
     * local time.
     *
     * @this {StdIO}
     * @param {...} args
     * @return {Date} (UTC unless a time string with a non-GMT timezone is explicitly provided)
     */
    parseDate(...args)
    {
        let date;
        if (args[0] === undefined) {
            date = new Date(Date.now());
        }
        else if (typeof args[0] === "string") {
            date = new Date(args[0] + ' ' + (args[1] || "00:00:00 GMT"));
        }
        else if (args[1] === undefined) {
            date = new Date(args[0]);
        } else {
            date = new Date(Date.UTC(...args));
        }
        return date;
    }

    /**
     * print(s, fBuffer)
     *
     * @this {StdIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     */
    print(s, fBuffer)
    {
        if (!fBuffer) {
            let i = s.lastIndexOf('\n');
            if (i >= 0) {
                console.log(StdIO.PrintBuffer + s.substr(0, i));
                StdIO.PrintBuffer = "";
                s = s.substr(i + 1);
            }
        }
        StdIO.PrintBuffer += s;
    }

    /**
     * println(s, fBuffer)
     *
     * @this {StdIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     */
    println(s, fBuffer)
    {
        this.print(s + '\n', fBuffer);
    }

    /**
     * printf(format, ...args)
     *
     * @this {StdIO}
     * @param {string} format
     * @param {...} [args]
     */
    printf(format, ...args)
    {
        this.print(this.sprintf(format, ...args));
    }

    /**
     * sprintf(format, ...args)
     *
     * Copied from the CCjs project (https://github.com/jeffpar/ccjs/blob/master/lib/stdio.js) and extended.
     *
     * Far from complete, let alone sprintf-compatible, but it's adequate for the handful of sprintf-style format
     * specifiers that I use.
     *
     * @this {StdIO}
     * @param {string} format
     * @param {...} [args]
     * @return {string}
     */
    sprintf(format, ...args)
    {
        let buffer = "";
        let aParts = format.split(/%([-+ 0#]*)([0-9]*|\*)(\.[0-9]+|)([hlL]?)([A-Za-z%])/);

        let iArg = 0, iPart;
        for (iPart = 0; iPart < aParts.length - 6; iPart += 6) {

            buffer += aParts[iPart];
            let arg, type = aParts[iPart+5];

            /*
             * Check for unrecognized types immediately, so we don't inadvertently pop any arguments;
             * the first 12 ("ACDFHIMNSTWY") are for our non-standard Date extensions (see below).
             *
             * For reference purposes, the standard ANSI C set of format types is: "dioxXucsfeEgGpn%".
             */
            let iType = "ACDFHIMNSTWYbdfjcsoXx%".indexOf(type);
            if (iType < 0) {
                buffer += '%' + aParts[iPart+1] + aParts[iPart+2] + aParts[iPart+3] + aParts[iPart+4] + type;
                continue;
            }

            if (iArg < args.length) {
                arg = args[iArg];
                if (type != '%') iArg++;
            } else {
                arg = args[args.length-1];
            }
            let flags = aParts[iPart+1];
            let width = aParts[iPart+2];
            if (width == '*') {
                width = arg;
                if (iArg < args.length) {
                    arg = args[iArg++];
                } else {
                    arg = args[args.length-1];
                }
            } else {
                width = +width || 0;
            }
            let precision = aParts[iPart+3];
            precision = precision? +precision.substr(1) : -1;
            // let length = aParts[iPart+4];       // eg, 'h', 'l' or 'L' (all currently ignored)
            let hash = flags.indexOf('#') >= 0;
            let zeroPad = flags.indexOf('0') >= 0;
            let ach = null, s, radix = 0, prefix = ""

            /*
             * The following non-standard sprintf() format codes provide handy alternatives to the
             * PHP date() format codes that we used to use with the old datelib.formatDate() function:
             *
             *      a:  lowercase ante meridiem and post meridiem (am or pm)                %A
             *      d:  day of the month, 2 digits with leading zeros (01, 02, ..., 31)     %02D
             *      D:  3-letter day of the week ("Sun", "Mon", ..., "Sat")                 %.3W
             *      F:  month ("January", "February", ..., "December")                      %F
             *      g:  hour in 12-hour format, without leading zeros (1, 2, ..., 12)       %I
             *      h:  hour in 24-hour format, without leading zeros (0, 1, ..., 23)       %H
             *      H:  hour in 24-hour format, with leading zeros (00, 01, ..., 23)        %02H
             *      i:  minutes, with leading zeros (00, 01, ..., 59)                       %02N
             *      j:  day of the month, without leading zeros (1, 2, ..., 31)             %D
             *      l:  day of the week ("Sunday", "Monday", ..., "Saturday")               %W
             *      m:  month, with leading zeros (01, 02, ..., 12)                         %02M
             *      M:  3-letter month ("Jan", "Feb", ..., "Dec")                           %.3F
             *      n:  month, without leading zeros (1, 2, ..., 12)                        %M
             *      s:  seconds, with leading zeros (00, 01, ..., 59)                       %02S
             *      y:  2-digit year (eg, 14)                                               %0.2Y
             *      Y:  4-digit year (eg, 2014)                                             %Y
             *
             * We also support a few custom format codes:
             *
             *      %C:  calendar output (equivalent to: %W, %F %D, %Y)
             *      %T:  timestamp output (equivalent to: %Y-%02M-%02D %02H:%02N:%02S)
             *
             * Use the optional '#' flag with any of the above '%' format codes to produce UTC results
             * (eg, '%#I' instead of '%I').
             *
             * The %A, %F, and %W types act as strings (which support the '-' left justification flag, as well as
             * the width and precision options), and the rest act as integers (which support the '0' padding flag
             * and the width option).  Also, while %Y does act as an integer, it also supports truncation using the
             * precision option (normally, integers do not); this enables a variable number of digits for the year.
             *
             * So old code like this:
             *
             *      printf("%s\n", formatDate("l, F j, Y", date));
             *
             * can now be written like this:
             *
             *      printf("%W, %F %D, %Y\n", date, date, date, date);
             *
             * or even more succinctly, as:
             *
             *      printf("%C\n", date);
             *
             * In fact, even the previous example can be written more succinctly as:
             *
             *      printf("%W, %F %D, %Y\n", date);
             *
             * because unlike the C runtime, we reuse the final parameter once the format string has exhausted all parameters.
             */
            let ch, date = /** @type {Date} */ (iType < 12 && typeof arg != "object"? this.parseDate(arg) : arg), dateUndefined;

            switch(type) {
            case 'C':
                ch = hash? '#' : '';
                buffer += (this.isDate(date)? this.sprintf(this.sprintf("%%%sW, %%%sF %%%sD, %%%sY", ch), date) : dateUndefined);
                continue;

            case 'D':
                arg = hash? date.getUTCDate() : date.getDate();
                type = 'd';
                break;

            case 'A':
            case 'H':
            case 'I':
                arg = hash? date.getUTCHours() : date.getHours();
                if (type == 'A') {
                    arg = (arg < 12 ? "am" : "pm");
                    type = 's';
                }
                else {
                    if (type == 'I') {
                        arg = (!arg? 12 : (arg > 12 ? arg - 12 : arg));
                    }
                    type = 'd';
                }
                break;

            case 'F':
            case 'M':
                arg = hash? date.getUTCMonth() : date.getMonth();
                if (type == 'F') {
                    arg = StdIO.NamesOfMonths[arg];
                    type = 's';
                } else {
                    arg++;
                    type = 'd';
                }
                break;

            case 'N':
                arg = hash? date.getUTCMinutes() : date.getMinutes();
                type = 'd';
                break;

            case 'S':
                arg = hash? date.getUTCSeconds() : date.getSeconds();
                type = 'd'
                break;

            case 'T':
                ch = hash? '#' : '';
                buffer += (this.isDate(date)? this.sprintf(this.sprintf("%%%sY-%%%s02M-%%%s02D %%%s02H:%%%s02N:%%%s02S", ch), date) : dateUndefined);
                continue;

            case 'W':
                arg = StdIO.NamesOfDays[hash? date.getUTCDay() : date.getDay()];
                type = 's';
                break;

            case 'Y':
                arg = hash? date.getUTCFullYear() : date.getFullYear();
                if (precision > 0) {
                    arg = arg % (Math.pow(10, precision));
                    precision = -1;
                }
                type = 'd';
                break;
            }

            switch(type) {
            case 'b':
                /*
                 * "%b" for boolean-like values is a non-standard format specifier that seems handy.
                 */
                buffer += (arg? "true" : "false");
                break;

            case 'd':
                /*
                 * We could use "arg |= 0", but there may be some value to supporting integers > 32 bits.
                 *
                 * Also, unlike the 'X' and 'x' hexadecimal cases, there's no need to explicitly check for string
                 * arguments, because Math.trunc() automatically coerces any string value to a (decimal) number.
                 */
                arg = Math.trunc(arg);
                /* falls through */

            case 'f':
                arg = +arg;
                s = arg + "";
                if (precision >= 0) {
                    s = arg.toFixed(precision);
                }
                if (s.length < width) {
                    if (zeroPad) {
                        if (arg < 0) {
                            width--;
                            s = s.substr(1);
                        }
                        s = ("0000000000" + s).slice(-width);
                        if (arg < 0) s = '-' + s;
                    } else {
                        s = ("          " + s).slice(-width);
                    }
                }
                buffer += s;
                break;

            case 'j':
                /*
                 * 'j' is one of our non-standard extensions to the sprintf() interface; it signals that
                 * the caller is providing an Object that should be rendered as JSON.  If a width is included
                 * (eg, "%2j"), it's used as an indentation value; otherwise, no whitespace is added.
                 */
                buffer += JSON.stringify(arg, null, width || undefined);
                break;

            case 'c':
                arg = typeof arg == "string"? arg[0] : String.fromCharCode(arg);
                /* falls through */

            case 's':
                /*
                 * 's' includes some non-standard behavior, such as coercing non-strings to strings first.
                 */
                if (arg !== undefined) {
                    if (typeof arg != "string") {
                        arg = arg.toString();
                    }
                    if (precision >= 0) {
                        arg = arg.substr(0, precision);
                    }
                    while (arg.length < width) {
                        if (flags.indexOf('-') >= 0) {
                            arg += ' ';
                        } else {
                            arg = ' ' + arg;
                        }
                    }
                }
                buffer += arg;
                break;

            case 'o':
                radix = 8;
                if (hash) prefix = "0";
                /* falls through */

            case 'X':
                ach = StdIO.HexUpperCase;
                // if (hash) prefix = "0X";     // I don't like that %#X uppercases both the prefix and the value
                /* falls through */

            case 'x':
                s = "";
                if (!radix) radix = 16;
                if (!prefix && hash) prefix = "0x";
                if (!ach) ach = StdIO.HexLowerCase;
                if (typeof arg == "string") {
                    /*
                     * Since we're advised to ALWAYS pass a radix to parseInt(), we must detect explicitly
                     * hex values ourselves, because using a radix of 10 with any "0x..." value always returns 0.
                     *
                     * And if the value CAN be interpreted as decimal, then we MUST interpret it as decimal, because
                     * we have sprintf() calls in /modules/pcx86/lib/testmon.js that depend on this code to perform
                     * decimal to hex conversion.  We're going to make our own rules here, since passing numbers in
                     * string form isn't part of the sprintf "spec".
                     */
                    arg = Number.parseInt(arg, arg.match(/(^0x|[a-f])/i)? 16 : 10);
                }
                if (zeroPad && !width) {
                    /*
                     * When zero padding is specified without a width (eg, "%0x"), we select a width based on the value.
                     */
                    let v = Math.abs(arg);
                    if (v <= 0xff) {
                        width = 2;
                    } else if (v <= 0xffff) {
                        width = 4;
                    } else if (v <= 0xffffffff) {
                        width = 8;
                    } else {
                        width = 9;
                    }
                    width += prefix.length;
                }
                width -= prefix.length;
                do {
                    let d = arg & (radix - 1);
                    arg >>>= (radix == 16? 4 : 3);
                    if (zeroPad || !s || d || arg) {
                        s = ach[d] + s;
                    } else {
                        if (prefix) {
                            s = prefix + s;
                            prefix = "";
                        }
                        if (width > 0) s = ' ' + s;
                    }
                } while (--width > 0 || arg);
                buffer += prefix + s;
                break;

            case '%':
                buffer += '%';
                break;

            default:
                buffer += "(unimplemented printf type %" + type + ")";
                break;
            }
        }

        buffer += aParts[iPart];
        return buffer;
    }

    /**
     * toHex(n)
     *
     * This is a helper function mainly intended for use in a debugging console, allowing you to display numbers
     * as hex by evaluating the expression "this.toHex(n)".
     *
     * In a C runtime, you might use "itoa(n, buffer, 16)", which would be in "stdlib" instead of "stdio", and
     * it would not display a "0x" prefix; however, since we're relying on sprintf() to perform all our number
     * to string conversions, and sprintf() is a "stdio" function, we're keeping all these related functions here.
     *
     * @this {StdIO}
     * @param {number} n
     */
    toHex(n)
    {
        return this.sprintf("%#x", n);
    }
}

/*
 * Global variables
 */
StdIO.PrintBuffer = "";

/*
 * Global constants
 */
StdIO.HexLowerCase = "0123456789abcdef";
StdIO.HexUpperCase = "0123456789ABCDEF";
StdIO.NamesOfDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
StdIO.NamesOfMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

Defs.CLASSES["StdIO"] = StdIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/lib/webio.js (C) Jeff Parsons 2012-2019
 */

/*
 * List of standard message groups.  The messages properties defines the set of active message
 * groups, and their names are defined by MESSAGE_NAMES.  See the Device class for more message
 * group definitions.
 *
 * NOTE: To support more than 32 message groups, be sure to use "+", not "|", when concatenating.
 */
var MESSAGE = {
    ALL:        0xffffffffffff,
    NONE:       0x000000000000,
    DEFAULT:    0x000000000000,
    BUFFER:     0x800000000000,
};

/** @typedef {{ class: (string|undefined), bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined) }} */
var Config;

/**
 * @class {WebIO}
 * @unrestricted
 * @property {string} idMachine
 * @property {string} idDevice
 * @property {Object} bindings
 * @property {string} aCommands
 * @property {number} iCommand
 * @property {Object} machine
 * @property {number} messages
 */
class WebIO extends StdIO {
    /**
     * WebIO()
     *
     * @this {WebIO}
     */
    constructor()
    {
        super();
        this.bindings = {};
        this.aCommands = [];
        this.iCommand = 0;
        /*
         * We want message settings to be per-machine, but this class has no knowledge of machines, so we set up
         * a dummy machine object, which the Device class will replace.
         */
        this.machine = {messages: 0};
        /*
         * If this becomes the Machine object, the following property will become the message setting for the entire
         * machine; otherwise, it will become a per-device message setting.
         */
        this.messages = 0;
    }

    /**
     * addBinding(binding, element)
     *
     * @this {WebIO}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let webIO = this, elementTextArea;

        switch (binding) {

        case WebIO.BINDING.CLEAR:
            element.onclick = function onClickClear() {
                webIO.clear();
            };
            break;

        case WebIO.BINDING.PRINT:
            elementTextArea = /** @type {HTMLTextAreaElement} */ (element);
            /*
             * This was added for Firefox (Safari will clear the <textarea> on a page reload, but Firefox does not).
             */
            elementTextArea.value = "";
            /*
             * An onKeyDown handler has been added to this element to intercept special (non-printable) keys, such as
             * the UP and DOWN arrow keys, which are used to implement a simple command history/recall feature.
             */
            elementTextArea.addEventListener(
                'keydown',
                function onKeyDown(event) {
                    event = event || window.event;
                    let keyCode = event.which || event.keyCode;
                    if (keyCode) {
                        let consume = false, s;
                        let text = elementTextArea.value;
                        let i = text.lastIndexOf('\n');
                        /*
                         * Checking for BACKSPACE is not as important as the UP and DOWN arrows, but it's helpful to ensure
                         * that BACKSPACE only erases characters on the final line; consume it otherwise.
                         */
                        if (keyCode == WebIO.KEYCODE.BS) {
                            if (elementTextArea.selectionStart <= i + 1) {
                                consume = true;
                            }
                        }
                        if (keyCode == WebIO.KEYCODE.UP) {
                            consume = true;
                            if (webIO.iCommand > 0) {
                                s = webIO.aCommands[--webIO.iCommand];
                            }
                        }
                        else if (keyCode == WebIO.KEYCODE.DOWN) {
                            consume = true;
                            if (webIO.iCommand < webIO.aCommands.length) {
                                s = webIO.aCommands[++webIO.iCommand] || "";
                            }
                        }
                        if (consume) event.preventDefault();
                        if (s != undefined) {
                            elementTextArea.value = text.substr(0, i + 1) + s;
                        }
                    }
                }
            );
            /*
             * One purpose of the onKeyPress handler for this element is to stop event propagation, so that if the
             * element has been explicitly given focus, any key presses won't be picked up by the Input device (which,
             * as that device's constructor explains, is monitoring key presses for the entire document).
             *
             * The other purpose is to support the entry of commands and pass them on to parseCommands().
             */
            elementTextArea.addEventListener(
                'keypress',
                function onKeyPress(event) {
                    event = event || window.event;
                    let charCode = event.which || event.keyCode;
                    if (charCode) {
                        let char = String.fromCharCode(charCode);
                        /*
                         * Move the caret to the end of any text in the textarea, unless it's already
                         * past the final LF (because it's OK to insert characters on the last line).
                         */
                        let text = elementTextArea.value;
                        let i = text.lastIndexOf('\n');
                        if (elementTextArea.selectionStart <= i) {
                            elementTextArea.setSelectionRange(text.length, text.length);
                        }

                        /*
                         * Don't let the Input device's document-based keypress handler see any key presses
                         * that came to this element first.
                         */
                        event.stopPropagation();

                        /*
                         * If '@' is pressed as the first character on the line, then append the last command
                         * that parseCommands() processed, and transform '@' into ENTER.
                         */
                        if (char == '@' && webIO.iCommand > 0) {
                            if (i + 1 == text.length) {
                                elementTextArea.value += webIO.aCommands[--webIO.iCommand];
                                char = '\r';
                            }
                        }

                        /*
                         * On the ENTER key, call parseCommands() to look for any COMMAND handlers and invoke
                         * them until one of them returns true.
                         *
                         * Note that even though new lines are entered with the ENTER (CR) key, which uses
                         * ASCII character '\r' (aka RETURN aka CR), new lines are stored in the text buffer
                         * as ASCII character '\n' (aka LINEFEED aka LF).
                         */
                        if (char == '\r') {
                            /*
                             * At the time we call any command handlers, a LINEFEED will not yet have been
                             * appended to the text, so for consistency, we prevent the default behavior and
                             * add the LINEFEED ourselves.  Unfortunately, one side-effect is that we must
                             * go to some extra effort to ensure the cursor remains in view; hence the stupid
                             * blur() and focus() calls.
                             */
                            event.preventDefault();
                            text = (elementTextArea.value += '\n');
                            elementTextArea.blur();
                            elementTextArea.focus();
                            let i = text.lastIndexOf('\n', text.length - 2);
                            let commands = text.slice(i + 1, -1) || "";
                            let result = webIO.parseCommands(commands);
                            if (result) webIO.println(result.replace(/\n$/, ""), false);
                        }
                    }
                }
            );
            break;
        }
    }

    /**
     * addBindings(bindings)
     *
     * Builds the set of ACTUAL bindings (this.bindings) from the set of DESIRED bindings (this.config['bindings']),
     * using either a "bindings" object map OR an array of "direct bindings".
     *
     * @this {WebIO}
     * @param {Object} [bindings]
     */
    addBindings(bindings = {})
    {
        let fDirectBindings = Array.isArray(bindings);
        /*
         * To relieve every device from having to explicitly declare its own container, we set up a default.
         */
        if (!bindings['container']) {
            bindings['container'] = this.idDevice;
        }
        for (let binding in bindings) {
            let id = bindings[binding];
            if (fDirectBindings) {
                binding = id;
            } else {
                /*
                 * This new bit of code allows us to define a binding like this:
                 *
                 *      "label": "0"
                 *
                 * and we will automatically look for "label0", "label1", etc, and build an array for binding "label".
                 */
                if (id.match(/^[0-9]+$/)) {
                    let i = +id;
                    this.bindings[binding] = [];
                    do {
                        id = binding + i++;
                        let element = document.getElementById(id);
                        if (!element) break;
                        this.bindings[binding].push(element);
                    } while (true);
                    continue;
                }
            }
            let element = document.getElementById(id);
            if (element) {
                this.bindings[binding] = element;
                this.addBinding(binding, element);
                continue;
            }
            if (MAXDEBUG && !fDirectBindings && id != this.idDevice) {
                this.printf("unable to find element '%s' for device '%s'\n", id, this.idDevice);
            }
        }
    }

    /**
     * addBindingOptions(element, options, fReset, sDefault)
     *
     * @this {WebIO}
     * @param {Element|HTMLSelectElement} element
     * @param {Object} options (eg, key/value pairs for a series of "option" elements)
     * @param {boolean} [fReset]
     * @param {string} [sDefault]
     */
    addBindingOptions(element, options, fReset, sDefault)
    {
        if (fReset) {
            element.options.length = 0;
        }
        if (options) {
            for (let prop in options) {
                let option = document.createElement("option");
                option.text = prop;
                option.value = (typeof options[prop] == "string"? options[prop] : prop);
                element.appendChild(option);
                if (option.value == sDefault) element.selectedIndex = element.options.length - 1;
            }
        }
    }

    /**
     * addHandler(sType, fn)
     *
     * @this {WebIO}
     * @param {string} sType
     * @param {function(Array.<string>)} fn
     */
    addHandler(sType, fn)
    {
        if (!WebIO.Handlers[this.idMachine]) WebIO.Handlers[this.idMachine] = {};
        if (!WebIO.Handlers[this.idMachine][sType]) WebIO.Handlers[this.idMachine][sType] = [];
        WebIO.Handlers[this.idMachine][sType].push(fn);
    }

    /**
     * alert(s, type)
     *
     * @this {WebIO}
     * @param {string} s
     * @param {string} [type]
     */
    alert(s, type)
    {
        if (type && WebIO.Alerts.list.indexOf(type) < 0) {
            alert(s);
            WebIO.Alerts.list.push(type);
        }
        this.println(s);
    }

    /**
     * assert(f, format, args)
     *
     * Verifies conditions that must be true (for DEBUG builds only).
     *
     * The Closure Compiler should automatically remove all references to assert() in non-DEBUG builds.
     *
     * TODO: Add a task to the build process that "asserts" there are no instances of "assertion failure" in RELEASE builds.
     *
     * @this {WebIO}
     * @param {*} f is the expression asserted to be true
     * @param {string} [format] is an optional description of the assertion failure
     * @param {...} [args]
     */
    assert(f, format, ...args)
    {
        if (DEBUG) {
            if (!f) {
                throw new Error(format? this.sprintf(format, ...args) : "assertion failure");
            }
        }
    }

    /**
     * clear()
     *
     * @this {WebIO}
     */
    clear()
    {
        let element = this.findBinding(WebIO.BINDING.PRINT, true);
        if (element) element.value = "";
    }

    /**
     * findBinding(name, all)
     *
     * @this {WebIO}
     * @param {string} name
     * @param {boolean} [all]
     * @return {Element|null|undefined}
     */
    findBinding(name, all)
    {
        return this.bindings[name];
    }

    /**
     * findHandlers(sType)
     *
     * @this {WebIO}
     * @param {string} sType
     * @return {Array.<function(Array.<string>)>|undefined}
     */
    findHandlers(sType)
    {
        return WebIO.Handlers[this.idMachine] && WebIO.Handlers[this.idMachine][sType];
    }

    /**
     * findProperty(obj, sProp, sSuffix)
     *
     * If both sProp and sSuffix are set, then any browser-specific prefixes are inserted between sProp and sSuffix,
     * and if a match is found, it is returned without sProp.
     *
     * For example, if findProperty(document, 'on', 'fullscreenchange') discovers that 'onwebkitfullscreenchange' exists,
     * it will return 'webkitfullscreenchange', in preparation for an addEventListener() call.
     *
     * More commonly, sSuffix is not used, so whatever property is found is returned as-is.
     *
     * @this {WebIO}
     * @param {Object|null|undefined} obj
     * @param {string} sProp
     * @param {string} [sSuffix]
     * @return {string|null}
     */
    findProperty(obj, sProp, sSuffix)
    {
        if (obj) {
            do {
                for (let i = 0; i < WebIO.BrowserPrefixes.length; i++) {
                    let sName = WebIO.BrowserPrefixes[i];
                    if (sSuffix) {
                        sName += sSuffix;
                        let sEvent = sProp + sName;
                        if (sEvent in obj) return sName;
                    } else {
                        if (!sName) {
                            sName = sProp[0];
                        } else {
                            sName += sProp[0].toUpperCase();
                        }
                        sName += sProp.substr(1);
                        if (sName in obj) return sName;
                    }
                }
                if (sProp.indexOf("screen") < 0) break;
                sProp = sProp.replace("screen", "Screen");
            } while (true);
        }
        return null;
    }

    /**
     * getBindingID(name)
     *
     * Since this.bindings contains the actual elements, not their original IDs, we must delve back into
     * the original this.config['bindings'] to determine the original ID.
     *
     * @this {WebIO}
     * @param {string} name
     * @return {string|undefined}
     */
    getBindingID(name)
    {
        return this.config['bindings'] && this.config['bindings'][name];
    }

    /**
     * getBindingText(name)
     *
     * @this {WebIO}
     * @param {string} name
     * @return {string|undefined}
     */
    getBindingText(name)
    {
        let text;
        let element = this.bindings[name];
        if (element) text = element.textContent;
        return text;
    }

    /**
     * getBounded(n, min, max)
     *
     * Restricts n to the bounds defined by min and max.  A side-effect is ensuring that the return
     * value is ALWAYS a number, even if n is not.
     *
     * @this {WebIO}
     * @param {number} n
     * @param {number} min
     * @param {number} max
     * @return {number} (updated n)
     */
    getBounded(n, min, max)
    {

        n = +n || 0;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    /**
     * getDefault(idConfig, defaultValue, mappings)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {*} defaultValue
     * @param {Object} [mappings] (used to provide optional user-friendly mappings for values)
     * @return {*}
     */
    getDefault(idConfig, defaultValue, mappings)
    {
        let value = this.config[idConfig];
        if (value === undefined) {
            value = defaultValue;
        } else {
            if (mappings && mappings[value] !== undefined) {
                value = mappings[value];
            }
            let type = typeof defaultValue;
            if (typeof value != type) {

                if (type == "boolean") {
                    value = !!value;
                } else if (typeof defaultValue == "number") {
                    value = +value;
                }
            }
        }
        return value;
    }

    /**
     * getDefaultBoolean(idConfig, defaultValue)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {boolean} defaultValue
     * @return {boolean}
     */
    getDefaultBoolean(idConfig, defaultValue)
    {
        return /** @type {boolean} */ (this.getDefault(idConfig, defaultValue));
    }

    /**
     * getDefaultNumber(idConfig, defaultValue, mappings)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {number} defaultValue
     * @param {Object} [mappings]
     * @return {number}
     */
    getDefaultNumber(idConfig, defaultValue, mappings)
    {
        return /** @type {number} */ (this.getDefault(idConfig, defaultValue, mappings));
    }

    /**
     * getDefaultString(idConfig, defaultValue)
     *
     * @this {WebIO}
     * @param {string} idConfig
     * @param {string} defaultValue
     * @return {string}
     */
    getDefaultString(idConfig, defaultValue)
    {
        return /** @type {string} */ (this.getDefault(idConfig, defaultValue));
    }

    /**
     * getHost()
     *
     * This is like getHostName() but with the port number, if any.
     *
     * @this {WebIO}
     * @return {string}
     */
    getHost()
    {
        return (window? window.location.host : "localhost");
    }

    /**
     * getHostName()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostName()
    {
        return (window? window.location.hostname : this.getHost());
    }

    /**
     * getHostOrigin()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostOrigin()
    {
        return (window? window.location.origin : this.getHost());
    }

    /**
     * getHostPath()
     *
     * @this {WebIO}
     * @return {string|null}
     */
    getHostPath()
    {
        return (window? window.location.pathname : null);
    }

    /**
     * getHostProtocol()
     *
     * @this {WebIO}
     * @return {string}
     */
    getHostProtocol()
    {
        return (window? window.location.protocol : "file:");
    }

    /**
     * getHostURL()
     *
     * @this {WebIO}
     * @return {string|null}
     */
    getHostURL()
    {
        return (window? window.location.href : null);
    }

    /**
     * getResource(url, done)
     *
     * Request the specified resource, and once the request is complete, notify done().
     *
     * done() is passed four parameters:
     *
     *      done(url, sResource, readyState, nErrorCode)
     *
     * readyState comes from the request's 'readyState' property, and the operation should not be
     * considered complete until readyState is 4.
     *
     * If nErrorCode is zero, sResource should contain the requested data; otherwise, an error occurred.
     *
     * @this {WebIO}
     * @param {string} url
     * @param {function(string,string,number,number)} done
     */
    getResource(url, done)
    {
        let obj = this;
        let nErrorCode = 0, sResource = null;
        let xmlHTTP = (window.XMLHttpRequest? new window.XMLHttpRequest() : new window.ActiveXObject("Microsoft.XMLHTTP"));
        xmlHTTP.onreadystatechange = function()
        {
            if (xmlHTTP.readyState !== 4) {
                done(url, sResource, xmlHTTP.readyState, nErrorCode);
                return;
            }

            /*
             * The following line was recommended for WebKit, as a work-around to prevent the handler firing multiple
             * times when debugging.  Unfortunately, that's not the only XMLHttpRequest problem that occurs when
             * debugging, so I think the WebKit problem is deeper than that.  When we have multiple XMLHttpRequests
             * pending, any debugging activity means most of them simply get dropped on floor, so what may actually be
             * happening are mis-notifications rather than redundant notifications.
             *
             *      xmlHTTP.onreadystatechange = undefined;
             */
            sResource = xmlHTTP.responseText;

            /*
             * The normal "success" case is an HTTP status code of 200, but when testing with files loaded
             * from the local file system (ie, when using the "file:" protocol), we have to be a bit more "flexible".
             */
            if (xmlHTTP.status == 200 || !xmlHTTP.status && sResource.length && obj.getHostProtocol() == "file:") {
                // if (MAXDEBUG) Web.log("xmlHTTP.onreadystatechange(" + url + "): returned " + sResource.length + " bytes");
            }
            else {
                nErrorCode = xmlHTTP.status || -1;
            }
            done(url, sResource, xmlHTTP.readyState, nErrorCode);
        };

        xmlHTTP.open("GET", url, true);
        xmlHTTP.send();
    }

    /**
     * getURLParms(sParms)
     *
     * @this {WebIO}
     * @param {string} [sParms] containing the parameter portion of a URL (ie, after the '?')
     * @return {Object} containing properties for each parameter found
     */
    getURLParms(sParms)
    {
        let parms = WebIO.URLParms;
        if (!parms) {
            parms = {};
            if (window) {
                if (!sParms) {
                    /*
                     * Note that window.location.href returns the entire URL, whereas window.location.search
                     * returns only parameters, if any (starting with the '?', which we skip over with a substr() call).
                     */
                    sParms = window.location.search.substr(1);
                }
                let match;
                let pl = /\+/g; // RegExp for replacing addition symbol with a space
                let search = /([^&=]+)=?([^&]*)/g;
                let decode = function decodeParameter(s) {
                    return decodeURIComponent(s.replace(pl, " ")).trim();
                };

                while ((match = search.exec(sParms))) {
                    parms[decode(match[1])] = decode(match[2]);
                }
            }
            WebIO.URLParms = parms;
        }
        return parms;
    }

    /**
     * hasLocalStorage
     *
     * If localStorage support exists, is enabled, and works, return true.
     *
     * @this {WebIO}
     * @return {boolean}
     */
    hasLocalStorage()
    {
        if (WebIO.LocalStorage.Available === undefined) {
            let f = false;
            if (window) {
                try {
                    window.localStorage.setItem(WebIO.LocalStorage.Test, WebIO.LocalStorage.Test);
                    f = (window.localStorage.getItem(WebIO.LocalStorage.Test) == WebIO.LocalStorage.Test);
                    window.localStorage.removeItem(WebIO.LocalStorage.Test);
                } catch(err) {
                    this.println(err.message);
                    f = false;
                }
            }
            WebIO.LocalStorage.Available = f;
        }
        return !!WebIO.LocalStorage.Available;
    }

    /**
     * isMessageOn(messages)
     *
     * If messages is MESSAGE.DEFAULT (0), then the device's default message group(s) are used,
     * and if it's MESSAGE.ALL (-1), then the message is always displayed, regardless what's enabled.
     *
     * @this {WebIO}
     * @param {number} [messages] is zero or more MESSAGE flags
     * @return {boolean} true if all specified message enabled, false if not
     */
    isMessageOn(messages = 0)
    {
        if (messages > 1 && (messages % 2)) messages--;
        messages = messages || this.messages;
        if ((messages|1) == -1 || this.testBits(this.machine.messages, messages)) {
            return true;
        }
        return false;
    }

    /**
     * isUserAgent(s)
     *
     * Check the browser's user-agent string for the given substring; "iOS" and "MSIE" are special values you can
     * use that will match any iOS or MSIE browser, respectively (even IE11, in the case of "MSIE").
     *
     * 2013-11-06: In a questionable move, MSFT changed the user-agent reported by IE11 on Windows 8.1, eliminating
     * the "MSIE" string (which MSDN calls a "version token"; see http://msdn.microsoft.com/library/ms537503.aspx);
     * they say "public websites should rely on feature detection, rather than browser detection, in order to design
     * their sites for browsers that don't support the features used by the website." So, in IE11, we get a user-agent
     * that tries to fool apps into thinking the browser is more like WebKit or Gecko:
     *
     *      Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko
     *
     * @this {WebIO}
     * @param {string} s is a substring to search for in the user-agent; as noted above, "iOS" and "MSIE" are special values
     * @return {boolean} is true if the string was found, false if not
     */
    isUserAgent(s)
    {
        if (window) {
            let userAgent = window.navigator.userAgent;
            return s == "iOS" && !!userAgent.match(/(iPod|iPhone|iPad)/) && !!userAgent.match(/AppleWebKit/) || s == "MSIE" && !!userAgent.match(/(MSIE|Trident)/) || (userAgent.indexOf(s) >= 0);
        }
        return false;
    }

    /**
     * loadLocalStorage()
     *
     * @this {WebIO}
     * @return {Array|null}
     */
    loadLocalStorage()
    {
        let state = null;
        if (this.hasLocalStorage()) {
            let sValue;
            if (window) {
                try {
                    sValue = window.localStorage.getItem(this.idMachine);
                    if (sValue) state = /** @type {Array} */ (JSON.parse(sValue));
                } catch (err) {
                    this.println(err.message);
                }
            }
        }
        return state;
    }

    /**
     * onPageEvent(sName, fn)
     *
     * This function creates a chain of callbacks, allowing multiple JavaScript modules to define handlers
     * for the same event, which wouldn't be possible if everyone modified window['onload'], window['onunload'],
     * etc, themselves.
     *
     * NOTE: It's risky to refer to obscure event handlers with "dot" names, because the Closure Compiler may
     * erroneously replace them (eg, window.onpageshow is a good example).
     *
     * @this {WebIO}
     * @param {string} sFunc
     * @param {function()} fn
     */
    onPageEvent(sFunc, fn)
    {
        if (window) {
            let fnPrev = window[sFunc];
            if (typeof fnPrev !== 'function') {
                window[sFunc] = fn;
            } else {
                /*
                 * TODO: Determine whether there's any value in receiving/sending the Event object that the
                 * browser provides when it generates the original event.
                 */
                window[sFunc] = function onWindowEvent() {
                    if (fnPrev) fnPrev();
                    fn();
                };
            }
        }
    }

    /**
     * parseBoolean(token)
     *
     * @this {WebIO}
     * @param {string} token (true if token is "on" or "true", false if "off" or "false", undefined otherwise)
     * @return {boolean|undefined}
     */
    parseBoolean(token)
    {
        return (token == "true" || token == "on"? true : (token == "false" || token == "off"? false : undefined));
    }

    /**
     * parseCommand(command)
     *
     * @this {WebIO}
     * @param {string} [command]
     * @return {string|undefined}
     */
    parseCommand(command)
    {
        let result;
        try {
            if (!command) return result;
            command = command.trim();
            if (command) {
                if (this.iCommand < this.aCommands.length && command == this.aCommands[this.iCommand]) {
                    this.iCommand++;
                } else {
                    this.aCommands.push(command);
                    this.iCommand = this.aCommands.length;
                }
            }

            let aTokens = command.split(' ');
            let token = aTokens[0], message, on, list, iToken;
            let afnHandlers = this.findHandlers(WebIO.HANDLER.COMMAND);

            switch(token[0]) {
            case 'm':
                if (token[1] == '?') {
                    result = "";
                    WebIO.MESSAGE_COMMANDS.forEach((cmd) => {result += cmd + '\n';});
                    if (result) result = "message commands:\n" + result;
                    break;
                }
                result = ""; iToken = 1; list = undefined;
                token = aTokens[aTokens.length-1].toLowerCase();
                on = this.parseBoolean(token);
                if (on != undefined) {
                    aTokens.pop();
                }
                if (aTokens.length <= 1) {
                    if (on != undefined) {
                        list = on;
                        on = undefined;
                    }
                    aTokens[iToken] = "all";
                }
                if (aTokens[iToken] == "all") {
                    aTokens = Object.keys(WebIO.MESSAGE_NAMES);
                }
                for (let i = iToken; i < aTokens.length; i++) {
                    token = aTokens[i];
                    message = WebIO.MESSAGE_NAMES[token];
                    if (!message) {
                        result += "unrecognized message: " + token + '\n';
                        break;
                    }
                    if (on != undefined) {
                        this.setMessages(message, on);
                    }
                    if (list == undefined || list == this.isMessageOn(message)) {
                        result += this.sprintf("%8s: %b\n", token, this.isMessageOn(message));
                    }
                }
                if (this.isMessageOn(MESSAGE.BUFFER)) {
                    result += "all messages will be buffered until buffer is turned off\n";
                }
                if (!result) result = "no messages\n";
                break;

            case '?':
                result = "";
                WebIO.COMMANDS.forEach((cmd) => {result += cmd + '\n';});
                if (result) result = "default commands:\n" + result;
                /* falls through */

            default:
                aTokens.unshift(command);
                if (afnHandlers) {
                    for (let i = 0; i < afnHandlers.length; i++) {
                        let s = afnHandlers[i](aTokens);
                        if (s != undefined) {
                            if (!result) {
                                result = s;
                            } else {
                                result += s;
                            }
                            break;
                        }
                    }
                }
                break;
            }
        }
        catch(err) {
            result = "error: " + err.message + '\n';
        }
        return result;
    }

    /**
     * parseCommands(commands)
     *
     * @this {WebIO}
     * @param {string} [commands]
     * @return {string|undefined}
     */
    parseCommands(commands = "?")
    {
        let result;
        if (commands) {
            result = "";
            let aCommands = commands.split(/(?:\n|;\s*)/);
            for (let i = 0; i < aCommands.length; i++) {
                result += this.parseCommand(aCommands[i]);
            }
        }
        return result;
    }

    /**
     * print(s)
     *
     * This overrides StdIO.print(), in case the device has a PRINT binding that should be used instead,
     * or if all printing should be buffered.
     *
     * @this {WebIO}
     * @param {string} s
     * @param {boolean} [fBuffer] (true to always buffer; otherwise, only buffer the last partial line)
     */
    print(s, fBuffer)
    {
        if (fBuffer == undefined) {
            fBuffer = this.isMessageOn(MESSAGE.BUFFER);
        }
        if (!fBuffer) {
            let element = this.findBinding(WebIO.BINDING.PRINT, true);
            if (element) {
                /*
                 * To help avoid situations where the element can get overwhelmed by the same repeated string,
                 * don't add the string if it already appears at the end.
                 */
                if (element.value.substr(-s.length) != s) {
                    element.value += s;
                    /*
                     * Prevent the <textarea> from getting too large; otherwise, printing becomes slower and slower.
                     */
                    if (!DEBUG && element.value.length > 8192) {
                        element.value = element.value.substr(element.value.length - 4096);
                    }
                    element.scrollTop = element.scrollHeight;
                    /*
                     * Safari requires this, to keep the caret at the end; Chrome and Firefox, not so much.  Go figure.
                     */
                    element.setSelectionRange(element.value.length, element.value.length);
                }
                return;
            }
        }
        super.print(s, fBuffer);
    }


    /**
     * printf(format, ...args)
     *
     * This overrides StdIO.printf(), to add support for Messages; if format is a number, then it's treated
     * as one or more MESSAGE flags, and the real format string is the first arg.
     *
     * @this {WebIO}
     * @param {string|number} format
     * @param {...} [args]
     */
    printf(format, ...args)
    {
        let messages = 0;
        if (typeof format == "number") {
            messages = format;
            format = args.shift();
        }
        if (this.isMessageOn(messages)) {
            super.printf(format, ...args);
        }
    }

    /**
     * saveLocalStorage(state)
     *
     * @this {WebIO}
     * @param {Array} state
     * @return {boolean} true if successful, false if error
     */
    saveLocalStorage(state)
    {
        if (this.hasLocalStorage()) {
            let sValue = JSON.stringify(state);
            try {
                window.localStorage.setItem(this.idMachine, sValue);
                return true;
            } catch(err) {
                this.println(err.message);
            }
        }
        return false;
    }

    /**
     * setBindingText(name, text)
     *
     * @this {WebIO}
     * @param {string} name
     * @param {string} text
     */
    setBindingText(name, text)
    {
        let element = this.bindings[name];
        if (element) element.textContent = text;
    }

    /**
     * setMessages(messages, on)
     *
     * Use this function to set/clear message groups.  Use isMessageOn() to decide whether to print
     * messages that are part of a group.
     *
     * MESSAGE.BUFFER is special, causing all print calls to be buffered; the print buffer will be dumped
     * as soon as setMessages() clears MESSAGE.BUFFER.
     *
     * @this {WebIO}
     * @param {number} messages
     * @param {boolean} on (true to set, false to clear)
     */
    setMessages(messages, on)
    {
        let flush = false;
        if (on) {
            this.machine.messages = this.setBits(this.machine.messages, messages);
        } else {
            flush = (this.testBits(this.machine.messages, MESSAGE.BUFFER) && this.testBits(messages, MESSAGE.BUFFER));
            this.machine.messages = this.clearBits(this.machine.messages, messages);
        }
        if (flush) this.flush();
    }
}

WebIO.BINDING = {
    CLEAR:      "clear",
    PRINT:      "print"
};

WebIO.COMMANDS = [
    "\u2191 \u2193\t\trecall commands",
    "@\t\trepeat last command",
    "m?\t\tmessage commands"
];

WebIO.MESSAGE_COMMANDS = [
    "m\t\tdisplay all messages",
    "m on\t\tdisplay all active messages",
    "m off\t\tdisplay all inactive messages",
    "m all [on|off]\tturn all messages on or off",
    "m ... [on|off]\tturn selected messages on or off"
];

/*
 * NOTE: The first name is automatically omitted from global "on" and "off" operations.
 */
WebIO.MESSAGE_NAMES = {
    "all":      MESSAGE.ALL,
    "buffer":   MESSAGE.BUFFER
};

WebIO.HANDLER = {
    COMMAND:    "command"
};

/*
 * Codes provided by KeyboardEvent.keyCode on a "keypress" event.
 */
WebIO.CHARCODE = {
    /* 0x0D */ CR:         13
};

/*
 * Codes provided by KeyboardEvent.keyCode on "keydown" and "keyup" events.
 */
WebIO.KEYCODE = {
    /* 0x08 */ BS:          8,          // BACKSPACE        (ASCII.CTRL_H)
    /* 0x09 */ TAB:         9,          // TAB              (ASCII.CTRL_I)
    /* 0x0A */ LF:          10,         // LINE-FEED        (ASCII.CTRL_J) (Some Windows-based browsers used to generate this via CTRL-ENTER)
    /* 0x0D */ CR:          13,         // CARRIAGE RETURN  (ASCII.CTRL_M)
    /* 0x10 */ SHIFT:       16,
    /* 0x11 */ CTRL:        17,
    /* 0x12 */ ALT:         18,
    /* 0x13 */ PAUSE:       19,         // PAUSE/BREAK
    /* 0x14 */ CAPS_LOCK:   20,
    /* 0x1B */ ESC:         27,
    /* 0x20 */ SPACE:       32,
    /* 0x21 */ PGUP:        33,
    /* 0x22 */ PGDN:        34,
    /* 0x23 */ END:         35,
    /* 0x24 */ HOME:        36,
    /* 0x25 */ LEFT:        37,
    /* 0x26 */ UP:          38,
    /* 0x27 */ RIGHT:       39,
    /* 0x27 */ FF_QUOTE:    39,
    /* 0x28 */ DOWN:        40,
    /* 0x2C */ FF_COMMA:    44,
    /* 0x2C */ PRTSC:       44,
    /* 0x2D */ INS:         45,
    /* 0x2E */ DEL:         46,
    /* 0x2E */ FF_PERIOD:   46,
    /* 0x2F */ FF_SLASH:    47,
    /* 0x30 */ ZERO:        48,
    /* 0x31 */ ONE:         49,
    /* 0x32 */ TWO:         50,
    /* 0x33 */ THREE:       51,
    /* 0x34 */ FOUR:        52,
    /* 0x35 */ FIVE:        53,
    /* 0x36 */ SIX:         54,
    /* 0x37 */ SEVEN:       55,
    /* 0x38 */ EIGHT:       56,
    /* 0x39 */ NINE:        57,
    /* 0x3B */ FF_SEMI:     59,
    /* 0x3D */ FF_EQUALS:   61,
    /* 0x41 */ A:           65,
    /* 0x42 */ B:           66,
    /* 0x43 */ C:           67,
    /* 0x44 */ D:           68,
    /* 0x45 */ E:           69,
    /* 0x46 */ F:           70,
    /* 0x47 */ G:           71,
    /* 0x48 */ H:           72,
    /* 0x49 */ I:           73,
    /* 0x4A */ J:           74,
    /* 0x4B */ K:           75,
    /* 0x4C */ L:           76,
    /* 0x4D */ M:           77,
    /* 0x4E */ N:           78,
    /* 0x4F */ O:           79,
    /* 0x50 */ P:           80,
    /* 0x51 */ Q:           81,
    /* 0x52 */ R:           82,
    /* 0x53 */ S:           83,
    /* 0x54 */ T:           84,
    /* 0x55 */ U:           85,
    /* 0x56 */ V:           86,
    /* 0x57 */ W:           87,
    /* 0x58 */ X:           88,
    /* 0x59 */ Y:           89,
    /* 0x5A */ Z:           90,
    /* 0x5B */ CMD:         91,         // aka WIN
    /* 0x5B */ FF_LBRACK:   91,
    /* 0x5C */ FF_BSLASH:   92,
    /* 0x5D */ RCMD:        93,         // aka MENU
    /* 0x5D */ FF_RBRACK:   93,
    /* 0x60 */ NUM_0:       96,
    /* 0x60 */ NUM_INS:     96,
    /* 0x60 */ FF_BQUOTE:   96,
    /* 0x61 */ NUM_1:       97,
    /* 0x61 */ NUM_END:     97,
    /* 0x62 */ NUM_2:       98,
    /* 0x62 */ NUM_DOWN:    98,
    /* 0x63 */ NUM_3:       99,
    /* 0x63 */ NUM_PGDN:    99,
    /* 0x64 */ NUM_4:       100,
    /* 0x64 */ NUM_LEFT:    100,
    /* 0x65 */ NUM_5:       101,
    /* 0x65 */ NUM_CENTER:  101,
    /* 0x66 */ NUM_6:       102,
    /* 0x66 */ NUM_RIGHT:   102,
    /* 0x67 */ NUM_7:       103,
    /* 0x67 */ NUM_HOME:    103,
    /* 0x68 */ NUM_8:       104,
    /* 0x68 */ NUM_UP:      104,
    /* 0x69 */ NUM_9:       105,
    /* 0x69 */ NUM_PGUP:    105,
    /* 0x6A */ NUM_MUL:     106,
    /* 0x6B */ NUM_ADD:     107,
    /* 0x6D */ NUM_SUB:     109,
    /* 0x6E */ NUM_DEL:     110,        // aka PERIOD
    /* 0x6F */ NUM_DIV:     111,
    /* 0x70 */ F1:          112,
    /* 0x71 */ F2:          113,
    /* 0x72 */ F3:          114,
    /* 0x73 */ F4:          115,
    /* 0x74 */ F5:          116,
    /* 0x75 */ F6:          117,
    /* 0x76 */ F7:          118,
    /* 0x77 */ F8:          119,
    /* 0x78 */ F9:          120,
    /* 0x79 */ F10:         121,
    /* 0x7A */ F11:         122,
    /* 0x7B */ F12:         123,
    /* 0x90 */ NUM_LOCK:    144,
    /* 0x91 */ SCROLL_LOCK: 145,
    /* 0xAD */ FF_DASH:     173,
    /* 0xBA */ SEMI:        186,        // Firefox:  59 (FF_SEMI)
    /* 0xBB */ EQUALS:      187,        // Firefox:  61 (FF_EQUALS)
    /* 0xBC */ COMMA:       188,
    /* 0xBD */ DASH:        189,        // Firefox: 173 (FF_DASH)
    /* 0xBE */ PERIOD:      190,
    /* 0xBF */ SLASH:       191,
    /* 0xC0 */ BQUOTE:      192,
    /* 0xDB */ LBRACK:      219,
    /* 0xDC */ BSLASH:      220,
    /* 0xDD */ RBRACK:      221,
    /* 0xDE */ QUOTE:       222,
    /* 0xE0 */ FF_CMD:      224         // Firefox only (used for both CMD and RCMD)
};

/*
 * Maps Firefox-specific keyCodes to their more common keyCode counterparts.
 */
WebIO.FF_KEYCODE = {
    [WebIO.KEYCODE.FF_SEMI]:    WebIO.KEYCODE.SEMI,     //  59 -> 186
    [WebIO.KEYCODE.FF_EQUALS]:  WebIO.KEYCODE.EQUALS,   //  61 -> 187
    [WebIO.KEYCODE.FF_DASH]:    WebIO.KEYCODE.DASH,     // 173 -> 189
    [WebIO.KEYCODE.FF_CMD]:     WebIO.KEYCODE.CMD       // 224 -> 91
};

/*
 * This maps KEYCODE values to ASCII character (or a string representation for non-ASCII keys).
 */
WebIO.KEYNAME = {
    [WebIO.KEYCODE.BS]:     "\b",
    [WebIO.KEYCODE.TAB]:    "\t",
    [WebIO.KEYCODE.LF]:     "\n",
    [WebIO.KEYCODE.CR]:     "\r",
    [WebIO.KEYCODE.SPACE]:  " ",
    [WebIO.KEYCODE.ZERO]:   "0",
    [WebIO.KEYCODE.ONE]:    "1",
    [WebIO.KEYCODE.TWO]:    "2",
    [WebIO.KEYCODE.THREE]:  "3",
    [WebIO.KEYCODE.FOUR]:   "4",
    [WebIO.KEYCODE.FIVE]:   "5",
    [WebIO.KEYCODE.SIX]:    "6",
    [WebIO.KEYCODE.SEVEN]:  "7",
    [WebIO.KEYCODE.EIGHT]:  "8",
    [WebIO.KEYCODE.NINE]:   "9",
    [WebIO.KEYCODE.A]:      "A",
    [WebIO.KEYCODE.B]:      "B",
    [WebIO.KEYCODE.C]:      "C",
    [WebIO.KEYCODE.D]:      "D",
    [WebIO.KEYCODE.E]:      "E",
    [WebIO.KEYCODE.F]:      "F",
    [WebIO.KEYCODE.G]:      "G",
    [WebIO.KEYCODE.H]:      "H",
    [WebIO.KEYCODE.I]:      "I",
    [WebIO.KEYCODE.J]:      "J",
    [WebIO.KEYCODE.K]:      "K",
    [WebIO.KEYCODE.L]:      "L",
    [WebIO.KEYCODE.M]:      "M",
    [WebIO.KEYCODE.N]:      "N",
    [WebIO.KEYCODE.O]:      "O",
    [WebIO.KEYCODE.P]:      "P",
    [WebIO.KEYCODE.Q]:      "Q",
    [WebIO.KEYCODE.R]:      "R",
    [WebIO.KEYCODE.S]:      "S",
    [WebIO.KEYCODE.T]:      "T",
    [WebIO.KEYCODE.U]:      "U",
    [WebIO.KEYCODE.V]:      "V",
    [WebIO.KEYCODE.W]:      "W",
    [WebIO.KEYCODE.X]:      "X",
    [WebIO.KEYCODE.Y]:      "Y",
    [WebIO.KEYCODE.Z]:      "Z",
    [WebIO.KEYCODE.LEFT]:   "Left",
    [WebIO.KEYCODE.RIGHT]:  "Right",
};

WebIO.BrowserPrefixes = ['', 'moz', 'ms', 'webkit'];

WebIO.Alerts = {
    list:       [],
    Version:    "version"
};

WebIO.LocalStorage = {
    Available:  undefined,
    Test:       "PCjs.localStorage"
};

/**
 * Handlers is a global object whose properties are machine IDs, each of which contains zero or more
 * handler IDs, each of which contains a set of functions that are indexed by one of the WebIO.HANDLER keys.
 *
 * @type {Object}
 */
WebIO.Handlers = {};

Defs.CLASSES["WebIO"] = WebIO;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/device.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ get: function(), set: function(number) }} */
var Register;

/**
 * In addition to basic Device services, such as:
 *
 *      addDevice()
 *      enumDevices()
 *      findDevice()
 *      findDeviceByClass()
 *
 * this class also supports register "registration" services, to allow a Device to make any registers
 * it supports available by name to other devices (notably the Debugger):
 *
 *      defineRegister()
 *      getRegister()
 *      setRegister()
 *
 * Besides CPUs, other devices may have internal registers or ports that are useful to access by name, too.
 *
 * @class {Device}
 * @unrestricted
 * @property {string} idMachine
 * @property {string} idDevice
 * @property {Config} config
 * @property {string} id
 * @property {Object} registers
 * @property {Device|undefined|null} cpu
 * @property {Device|undefined|null} dbg
 */
class Device extends WebIO {
    /**
     * Device()
     *
     * Supported config properties:
     *
     *      "bindings": object containing name/value pairs, where name is the generic name
     *      of a element, and value is the ID of the DOM element that should be mapped to it
     *
     * The properties in the "bindings" object are copied to our own bindings object in addBindings(),
     * but only for DOM elements that actually exist, and it is the elements themselves (rather than
     * their IDs) that we store.
     *
     * Also, URL parameters can be used to override config properties, as long as those properties
     * have been listed in the device's "overrides" array.  For example, the URL:
     *
     *      http://localhost:4000/?cyclesPerSecond=100000
     *
     * will set the Time device's cyclesPerSecond config property to 100000.  In general, the values
     * will be treated as strings, unless they contain all digits (number), or equal "true" or "false"
     * (boolean).
     *
     * @this {Device}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     * @param {Array} [overrides] (default overrides, if any, which in turn can be overridden by config['overrides'])
     */
    constructor(idMachine, idDevice, config, overrides)
    {
        super();
        this.idMachine = idMachine;
        this.idDevice = idDevice;
        this.checkConfig(config, overrides);
        this.addDevice();
        this.machine = this.findDevice(this.idMachine);
        this.registers = {};
        this.cpu = this.dbg = undefined;
    }

    /**
     * addDevice()
     *
     * Adds this Device to the global set of Devices, so that findDevice(), findBinding(), etc, will work.
     *
     * @this {Device}
     */
    addDevice()
    {
        if (!Device.Machines[this.idMachine]) Device.Machines[this.idMachine] = [];
        if (Device.Machines[this.idMachine][this.idDevice]) {
            this.printf("warning: machine configuration contains multiple '%s' devices\n", this.idDevice);
        }
        Device.Machines[this.idMachine][this.idDevice] = this;
        /*
         * The new Device classes don't use the Components array or machine+device IDs, but we need to continue
         * updating both of those for backward compatibility with older PCjs machines.
         */
        this['id'] = this.idMachine + '.' + this.idDevice;
        Device.Components.push(this);
    }

    /**
     * checkConfig(config, overrides)
     *
     * @this {Device}
     * @param {Config} [config]
     * @param {Array} [overrides]
     */
    checkConfig(config = {}, overrides = [])
    {
        /*
         * If this device's config contains an "overrides" array, then any of the properties listed in
         * that array may be overridden with a URL parameter.  We don't impose any checks on the overriding
         * value, so it is the responsibility of the component with overridable properties to validate them.
         */
        overrides = config['overrides'] || overrides;
        if (overrides.length) {
            let parms = this.getURLParms();
            for (let prop in parms) {
                if (overrides.indexOf(prop) >= 0) {
                    let value;
                    let s = parms[prop];
                    /*
                     * You might think we could simply call parseInt() and check isNaN(), but parseInt() has
                     * some annoying quirks, like stopping at the first non-numeric character.  If the ENTIRE
                     * string isn't a number, then we don't want to treat ANY part of it as a number.
                     */
                    if (s.match(/^[+-]?[0-9.]+$/)) {
                        value = Number.parseInt(s, 10);
                    } else if (s == "true") {
                        value = true;
                    } else if (s == "false") {
                        value = false;
                    } else {
                        value = s;
                        s = '"' + s + '"';
                    }
                    config[prop] = value;
                    this.println("overriding " + this.idDevice + " property '" + prop + "' with " + s);
                }
            }
        }
        this.config = config;
        this.addBindings(config['bindings']);
        this.checkVersion(config);
    }

    /**
     * checkVersion(config)
     *
     * Verify that device's version matches the machine's version, and also that the config version stored in
     * the JSON (if any) matches the device's version.
     *
     * This is normally performed by the constructor, but the Machine device cannot be fully initialized in the
     * constructor, so it calls this separately.
     *
     * @this {Device}
     * @param {Config} config
     */
    checkVersion(config)
    {
        this.version = +VERSION;
        if (this.version) {
            let sVersion = "", version;
            if (this.idMachine != this.idDevice) {
                let machine = this.findDevice(this.idMachine);
                version = machine.version;
                if (version && version != this.version) {
                    sVersion = "Machine";
                }
            }
            if (!sVersion) {
                version = config['version'];
                if (version && version > this.version) {
                    sVersion = "Config";
                }
            }
            if (sVersion) {
                let sError = this.sprintf("%s Device version (%3.2f) incompatible with %s version (%3.2f)", config.class, this.version, sVersion, version);
                this.alert("Error: " + sError + '\n\n' + "Clearing your browser's cache may resolve the issue.", Device.Alerts.Version);
            }
        }
    }

    /**
     * defineRegister(name, get, set)
     *
     * @this {Device}
     * @param {string} name
     * @param {function()} get
     * @param {function(number)} set
     */
    defineRegister(name, get, set)
    {
        this.registers[name] = {get: get.bind(this), set: set.bind(this)};
    }

    /**
     * enumDevices(func)
     *
     * @this {Device}
     * @param {function(Device)} func
     * @return {boolean} (true if all devices successfully enumerated, false otherwise)
     */
    enumDevices(func)
    {
        let id;
        try {
            let devices = Device.Machines[this.idMachine];
            if (devices) {
                for (id in devices) {
                    let device = devices[id];
                    if (device.config['class'] != "Machine") {
                        if (!func(device)) return false;
                    }
                }
            }
            return true;
        } catch(err) {
            this.printf("error while enumerating device '%s': %s\n", id, err.message);
        }
        return false;
    }

    /**
     * findBinding(name, all)
     *
     * This will search the current device's bindings, and optionally all the device bindings within the
     * machine.  If the binding is found in another device, that binding is recorded in this device as well.
     *
     * @this {Device}
     * @param {string} name
     * @param {boolean} [all]
     * @return {Element|null|undefined}
     */
    findBinding(name, all = false)
    {
        let element = super.findBinding(name, all);
        if (element === undefined && all) {
            let devices = Device.Machines[this.idMachine];
            for (let id in devices) {
                element = devices[id].bindings[name];
                if (element) break;
            }
            if (!element) element = null;
            this.bindings[name] = element;
        }
        return element;
    }

    /**
     * findDevice(idDevice, fRequired)
     *
     * @this {Device}
     * @param {string} idDevice
     * @param {boolean} [fRequired] (default is true, so if the device is not found, an Error is thrown)
     * @return {Device|null}
     */
    findDevice(idDevice, fRequired=true)
    {
        let id = idDevice;
        let idMachine = this.idMachine;
        let i = idMachine.indexOf('.');
        if (i > 0) {
            idMachine = idMachine.substr(0, i);
            idDevice = idDevice.substr(i + 1);
        }
        let devices = Device.Machines[idMachine];
        let device = devices && devices[idDevice] || null;
        if (!device) {
            /*
             * Also check the old list of PCjs machine component IDs, to maintain backward compatibility.
             */
            for (i = 0; i < Device.Components.length; i++) {
                if (Device.Components[i]['id'] === id) {
                    device = Device.Components[i];
                    break;
                }
            }
            if (!device && fRequired) {
                throw new Error(this.sprintf("unable to find device with ID '%s'", id));
            }
        }
        return device;
    }

    /**
     * findDeviceByClass(idClass, fRequired)
     *
     * This is only appropriate for device classes where no more than one instance of the device is allowed;
     * for example, it is NOT appropriate for the Bus class, because machines can have multiple buses (eg, an
     * I/O bus and a memory bus).
     *
     * @this {Device}
     * @param {string} idClass
     * @param {boolean} [fRequired] (default is true, so if the device is not found, an Error is thrown)
     * @return {Device|null}
     */
    findDeviceByClass(idClass, fRequired=true)
    {
        let device = null;
        let devices = Device.Machines[this.idMachine];
        if (devices) {
            for (let id in devices) {
                if (devices[id].config['class'] == idClass) {
                    if (device) {
                        device = null;      // multiple devices with the same class, so return an error
                        break;
                    }
                    device = devices[id];
                }
            }
        }
        if (!device && fRequired) {
            throw new Error(this.sprintf("unable to find device with class '%s'", idClass));
        }
        return device;
    }

    /**
     * getMachineConfig(prop)
     *
     * @this {Device}
     * @param {string} prop
     * @return {*}
     */
    getMachineConfig(prop)
    {
        let machine = this.findDevice(this.idMachine);
        return machine && machine.config && machine.config[prop];
    }

    /**
     * getRegister(name)
     *
     * @this {Device}
     * @param {string} name
     * @return {number|undefined}
     */
    getRegister(name)
    {
        let reg = this.registers[name];
        return reg && reg.get();
    }

    /**
     * notifyMessage(messages)
     *
     * Overidden by other devices (eg, Debugger) to receive notifications of messages, along with the messages bits.
     *
     * @this {Device}
     * @param {number} messages
     */
    notifyMessage(messages)
    {
    }

    /**
     * printf(format, ...args)
     *
     * Just as WebIO.printf() overrides StdIO.printf() to add support for Messages, we override WebIO.printf()
     * to add support for MESSAGE.ADDR: if that message bit is set, we want to append the current execution address
     * (PC) to any message-driven printf() call.
     *
     * @this {Device}
     * @param {string|number} format
     * @param {...} args
     */
    printf(format, ...args)
    {
        if (typeof format == "number" && this.isMessageOn(format)) {
            /*
             * The following will execute at most once, because findDeviceByClass() returns either a Device or null,
             * neither of which is undefined.
             */
            if (this.dbg === undefined) {
                this.dbg = /** @type {Device} */ (this.findDeviceByClass("Debugger"));
            }
            if (this.dbg) {
                this.dbg.notifyMessage(format);
            }
            if (this.machine.messages & MESSAGE.ADDR) {
                /*
                * Same rules as above apply here.  Hopefully no message-based printf() calls will arrive with MESSAGE.ADDR
                * set *before* the CPU device has been initialized.
                */
                if (this.cpu === undefined) {
                    this.cpu = /** @type {Device} */ (this.findDeviceByClass("CPU"));
                }
                if (this.cpu) {
                    format = args.shift();
                    let s = this.sprintf(format, ...args).trim();
                    super.printf("%s at %#0x\n", s, this.cpu.regPCLast);
                    return;
                }
            }
        }
        super.printf(format, ...args);
    }

    /**
     * removeDevice(idDevice)
     *
     * @this {Device}
     * @param {string} idDevice
     */
    removeDevice(idDevice)
    {
        let device;
        let devices = Device.Machines[this.idMachine];
        if (devices) delete devices[idDevice];
    }

    /**
     * setRegister(name, value)
     *
     * @this {Device}
     * @param {string} name
     * @param {number} value
     * @return {boolean} (true if register exists and successfully set, false otherwise)
     */
    setRegister(name, value)
    {
        let reg = this.registers[name];
        if (reg) {
            reg.set(value);
            return true;
        }
        return false;
    }
}

/**
 * Machines is a global object whose properties are machine IDs and whose values are arrays of Devices.
 *
 * @type {Object}
 */
Device.Machines = {};

/**
 * Components is maintained for backward-compatibility with older PCjs machines, to facilitate machine connections.
 *
 * @type {Array}
 */
Device.Components = [];

/*
 * List of additional message groups, extending the base set defined in lib/webio.js.
 *
 * NOTE: To support more than 32 message groups, be sure to use "+", not "|", when concatenating.
 */
MESSAGE.ADDR            = 0x000000000001;       // this is a special bit (bit 0) used to append address info to messages
MESSAGE.BUS             = 0x000000000002;
MESSAGE.MEMORY          = 0x000000000004;
MESSAGE.PORTS           = 0x000000000008;
MESSAGE.CHIPS           = 0x000000000010;
MESSAGE.KBD             = 0x000000000020;
MESSAGE.SERIAL          = 0x000000000040;
MESSAGE.MISC            = 0x000000000080;
MESSAGE.CPU             = 0x000000000100;
MESSAGE.VIDEO           = 0x000000000200;       // used with video hardware messages (see video.js)
MESSAGE.MONITOR         = 0x000000000400;       // used with video monitor messages (see monitor.js)
MESSAGE.SCREEN          = 0x000000000800;       // used with screen-related messages (also monitor.js)
MESSAGE.TIMER           = 0x000000001000;
MESSAGE.EVENT           = 0x000000002000;
MESSAGE.KEY             = 0x000000004000;
MESSAGE.MOUSE           = 0x000000008000;
MESSAGE.TOUCH           = 0x000000010000;
MESSAGE.WARN            = 0x000000020000;
MESSAGE.HALT            = 0x000000040000;

WebIO.MESSAGE_NAMES["addr"]     = MESSAGE.ADDR;
WebIO.MESSAGE_NAMES["bus"]      = MESSAGE.BUS;
WebIO.MESSAGE_NAMES["memory"]   = MESSAGE.MEMORY;
WebIO.MESSAGE_NAMES["ports"]    = MESSAGE.PORTS;
WebIO.MESSAGE_NAMES["chips"]    = MESSAGE.CHIPS;
WebIO.MESSAGE_NAMES["kbd"]      = MESSAGE.KBD;
WebIO.MESSAGE_NAMES["serial"]   = MESSAGE.SERIAL;
WebIO.MESSAGE_NAMES["misc"]     = MESSAGE.MISC;
WebIO.MESSAGE_NAMES["cpu"]      = MESSAGE.CPU;
WebIO.MESSAGE_NAMES["video"]    = MESSAGE.VIDEO;
WebIO.MESSAGE_NAMES["monitor"]  = MESSAGE.MONITOR;
WebIO.MESSAGE_NAMES["screen"]   = MESSAGE.SCREEN;
WebIO.MESSAGE_NAMES["timer"]    = MESSAGE.TIMER;
WebIO.MESSAGE_NAMES["event"]    = MESSAGE.EVENT;
WebIO.MESSAGE_NAMES["key"]      = MESSAGE.KEY;
WebIO.MESSAGE_NAMES["mouse"]    = MESSAGE.MOUSE;
WebIO.MESSAGE_NAMES["touch"]    = MESSAGE.TOUCH;
WebIO.MESSAGE_NAMES["warn"]     = MESSAGE.WARN;
WebIO.MESSAGE_NAMES["halt"]     = MESSAGE.HALT;

if (window) {
    if (!window['PCjs']) window['PCjs'] = {};
    Device.Machines = window['PCjs']['Machines'] || (window['PCjs']['Machines'] = {});
    Device.Components = window['PCjs']['Components'] || (window['PCjs']['Components'] = []);
}

Defs.CLASSES["Device"] = Device;



/**
 * @copyright https://www.pcjs.org/modules/devices/bus/bus.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ type: string, addrWidth: number, dataWidth: number, blockSize: (number|undefined), littleEndian: (boolean|undefined) }} */
var BusConfig;

/**
 * @class {Bus}
 * @unrestricted
 * @property {BusConfig} config
 * @property {number} type (Bus.TYPE value, converted from config['type'])
 * @property {number} addrWidth
 * @property {number} addrTotal
 * @property {number} addrLimit
 * @property {number} blockSize
 * @property {number} blockTotal
 * @property {number} blockShift
 * @property {number} blockLimit
 * @property {number} dataWidth
 * @property {number} dataLimit
 * @property {boolean} littleEndian
 * @property {Array.<Memory>} blocks
 * @property {number} nTraps (number of blocks currently being trapped)
 */
class Bus extends Device {
    /**
     * Bus(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "bus": {
     *        "class": "Bus",
     *        "type": "static",
     *        "addrWidth": 16,
     *        "dataWidth": 8,
     *        "blockSize": 1024,
     *        "littleEndian": true
     *      }
     *
     * @this {Bus}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {BusConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        /*
         * Our default type is DYNAMIC for the sake of older device configs (eg, TI-57) which didn't specify a type
         * and need a dynamic bus to ensure that their LED ROM array (if any) gets updated on ROM accesses.  Obviously,
         * that can (and should) be controlled by a configuration file that is unique to the device's display requirements,
         * but at the moment, all TI-57 config files have LED ROM array support enabled, whether it's actually used or not.
         */
        this.type = config['type'] == "static"? Bus.TYPE.STATIC : Bus.TYPE.DYNAMIC;
        this.addrWidth = config['addrWidth'] || 16;
        this.addrTotal = Math.pow(2, this.addrWidth);
        this.addrLimit = (this.addrTotal - 1)|0;
        this.blockSize = config['blockSize'] || 1024;
        if (this.blockSize > this.addrTotal) this.blockSize = this.addrTotal;
        this.blockTotal = (this.addrTotal / this.blockSize)|0;
        this.blockShift = Math.log2(this.blockSize)|0;
        this.blockLimit = (1 << this.blockShift) - 1;
        this.dataWidth = config['dataWidth'] || 8;
        this.dataLimit = Math.pow(2, this.dataWidth) - 1;
        this.littleEndian = config['littleEndian'] !== false;
        this.blocks = new Array(this.blockTotal);
        this.nTraps = 0;
        let block = new Memory(idMachine, idDevice + "[NONE]", {"size": this.blockSize, "bus": this.idDevice});
        for (let addr = 0; addr < this.addrTotal; addr += this.blockSize) {
            this.addBlocks(addr, this.blockSize, Memory.TYPE.NONE, block);
        }
        this.selectInterface(this.type);
    }

    /**
     * addBlocks(addr, size, type, block)
     *
     * Bus interface for other devices to add blocks at specific addresses.  It's an error to add blocks to
     * regions that already contain blocks (other than blocks with TYPE of NONE).  There is no attempt to clean
     * up that error (and there is no removeBlocks() function) because it's currently considered a configuration
     * error, but that will likely change as machines with fancier buses are added.
     *
     * @this {Bus}
     * @param {number} addr is the starting physical address of the request
     * @param {number} size of the request, in bytes
     * @param {number} type is one of the Memory.TYPE constants
     * @param {Memory} [block] (optional preallocated block that must implement the same Memory interfaces the Bus uses)
     * @return {boolean} (true if successful, false if error)
     */
    addBlocks(addr, size, type, block)
    {
        let addrNext = addr;
        let sizeLeft = size;
        let offset = 0;
        let iBlock = addrNext >>> this.blockShift;
        while (sizeLeft > 0 && iBlock < this.blocks.length) {
            let blockNew;
            let addrBlock = iBlock * this.blockSize;
            let sizeBlock = this.blockSize - (addrNext - addrBlock);
            if (sizeBlock > sizeLeft) sizeBlock = sizeLeft;
            let blockExisting = this.blocks[iBlock];
            /*
             * If addrNext does not equal addrBlock, or sizeBlock does not equal this.blockSize, then either
             * the current block doesn't start on a block boundary or the size is something other than a block;
             * while we might support such requests down the road, that is currently a configuration error.
             */
            if (addrNext != addrBlock || sizeBlock != this.blockSize) {

                return false;
            }
            /*
             * Make sure that no block exists at the specified address, or if so, make sure its type is NONE.
             */
            if (blockExisting && blockExisting.type != Memory.TYPE.NONE) {

                return false;
            }
            /*
             * When no block is provided, we must allocate one that matches the specified type (and remaining size).
             */
            let idBlock = this.idDevice + '[' + this.toBase(addrNext, 16, this.addrWidth) + ']';
            if (!block) {
                blockNew = new Memory(this.idMachine, idBlock, {type, addr: addrNext, size: sizeBlock, "bus": this.idDevice});
            } else {
                /*
                 * When a block is provided, make sure its size maches the default Bus block size, and use it if so.
                 */
                if (block['size'] == this.blockSize) {
                    blockNew = block;
                } else {
                    /*
                     * When a block of a different size is provided, make a new block, importing any values as needed.
                     */
                    let values;
                    if (block['values']) {
                        values = block['values'].slice(offset, offset + sizeBlock);
                        if (values.length != sizeBlock) {

                            return false;
                        }
                    }
                    blockNew = new Memory(this.idMachine, idBlock, {type, addr: addrNext, size: sizeBlock, "bus": this.idDevice, values});
                }
            }
            this.blocks[iBlock] = blockNew;
            addrNext = addrBlock + this.blockSize;
            sizeLeft -= sizeBlock;
            offset += sizeBlock;
            iBlock++;
        }
        return true;
    }

    /**
     * cleanBlocks(addr, size)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} size
     * @return {boolean} true if all blocks were clean, false if dirty; all blocks are cleaned in the process
     */
    cleanBlocks(addr, size)
    {
        let clean = true;
        let iBlock = addr >>> this.blockShift;
        let sizeBlock = this.blockSize - (addr & this.blockLimit);
        while (size > 0 && iBlock < this.blocks.length) {
            if (this.blocks[iBlock].isDirty()) {
                clean = false;
            }
            size -= sizeBlock;
            sizeBlock = this.blockSize;
            iBlock++;
        }
        return clean;
    }

    /**
     * enumBlocks(types, func)
     *
     * This is used by the Debugger to enumerate all the blocks of certain types.
     *
     * @this {Bus}
     * @param {number} types
     * @param {function(Memory)} func
     * @return {number} (the number of blocks enumerated based on the requested types)
     */
    enumBlocks(types, func)
    {
        let cBlocks = 0;
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (!block || !(block.type & types)) continue;
            func(block);
            cBlocks++;
        }
        return cBlocks;
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Bus}
     */
    onReset()
    {
        /*
         * The following logic isn't needed because Memory and Port objects are Devices as well,
         * so their onReset() handlers will be invoked automatically.
         *
         *      this.enumBlocks(Memory.TYPE.WRITABLE, function(block) {
         *          if (block.onReset) block.onReset();
         *      });
         */
    }

    /**
     * onLoad(state)
     *
     * Automatically called by the Machine device if the machine's 'autoSave' property is true.
     *
     * @this {Bus}
     * @param {Array} state
     * @return {boolean}
     */
    onLoad(state)
    {
        return state && this.loadState(state)? true : false;
    }

    /**
     * onSave(state)
     *
     * Automatically called by the Machine device before all other devices have been powered down (eg, during
     * a page unload event).
     *
     * @this {Bus}
     * @param {Array} state
     */
    onSave(state)
    {
        this.saveState(state);
    }

    /**
     * loadState(state)
     *
     * @this {Bus}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (this.type == Bus.TYPE.DYNAMIC || (block.type & Memory.TYPE.READWRITE)) {
                if (block.loadState) {
                    let stateBlock = state.shift();
                    if (!block.loadState(stateBlock)) return false;
                }
            }
        }
        return true;
    }

    /**
     * saveState(state)
     *
     * @this {Bus}
     * @param {Array} state
     */
    saveState(state)
    {
        for (let iBlock = 0; iBlock < this.blocks.length; iBlock++) {
            let block = this.blocks[iBlock];
            if (this.type == Bus.TYPE.DYNAMIC || (block.type & Memory.TYPE.READWRITE)) {
                if (block.saveState) {
                    let stateBlock = [];
                    block.saveState(stateBlock);
                    state.push(stateBlock);
                }
            }
        }
    }

    /**
     * readBlockData(addr)
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockData(addr)
    {

        return this.blocks[addr >>> this.blockShift].readData(addr & this.blockLimit);
    }

    /**
     * writeBlockData(addr, value)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockData(addr, value)
    {

        this.blocks[addr >>> this.blockShift].writeData(addr & this.blockLimit, value);
    }

    /**
     * readBlockPairBE(addr)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockPairBE(addr)
    {

        if (addr & 0x1) {
            return this.readData((addr + 1) & this.addrLimit) | (this.readData(addr) << this.dataWidth);
        }
        return this.blocks[addr >>> this.blockShift].readPair(addr & this.blockLimit);
    }

    /**
     * readBlockPairLE(addr)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @return {number}
     */
    readBlockPairLE(addr)
    {

        if (addr & 0x1) {
            return this.readData(addr) | (this.readData((addr + 1) & this.addrLimit) << this.dataWidth);
        }
        return this.blocks[addr >>> this.blockShift].readPair(addr & this.blockLimit);
    }

    /**
     * writeBlockPairBE(addr, value)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockPairBE(addr, value)
    {

        if (addr & 0x1) {
            this.writeData(addr, value >> this.dataWidth);
            this.writeData((addr + 1) & this.addrLimit, value & this.dataLimit);
            return;
        }
        this.blocks[addr >>> this.blockShift].writePair(addr & this.blockLimit, value);
    }

    /**
     * writeBlockPairLE(addr, value)
     *
     * NOTE: Any addr we are passed is assumed to be properly masked; however, any address that we
     * we calculate ourselves (ie, addr + 1) must be masked ourselves.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {number} value
     */
    writeBlockPairLE(addr, value)
    {

        if (addr & 0x1) {
            this.writeData(addr, value & this.dataLimit);
            this.writeData((addr + 1) & this.addrLimit, value >> this.dataWidth);
            return;
        }
        this.blocks[addr >>> this.blockShift].writePair(addr & this.blockLimit, value);
    }

    /**
     * selectInterface(nTraps)
     *
     * We prefer Bus readData() and writeData() functions that access the corresponding values directly,
     * but if the Bus is dynamic (or if any traps are enabled), then we must revert to calling functions instead.
     *
     * In reality, this function exists purely for future optimizations; for now, we always use the block functions.
     *
     * @this {Bus}
     * @param {number} nTraps
     */
    selectInterface(nTraps)
    {
        this.nTraps += nTraps;

        this.readData = this.readBlockData;
        this.writeData = this.writeBlockData;
        if (!this.littleEndian) {
            this.readPair = this.readBlockPairBE;
            this.writePair = this.writeBlockPairBE;
        } else {
            this.readPair = this.readBlockPairLE;
            this.writePair = this.writeBlockPairLE;
        }
    }

    /**
     * trapRead(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if trap successful, false if unsupported or already trapped by another function
     */
    trapRead(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].trapRead(func)) {
            this.selectInterface(1);
            return true;
        }
        return false;
    }

    /**
     * trapWrite(addr, func)
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the original address,
     * only the block offset.
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapWrite(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].trapWrite(func)) {
            this.selectInterface(1);
            return true;
        }
        return false;
    }

    /**
     * untrapRead(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapRead(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].untrapRead(func)) {
            this.selectInterface(-1);
            return true;
        }
        return false;
    }

    /**
     * untrapWrite(addr, func)
     *
     * @this {Bus}
     * @param {number} addr
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapWrite(addr, func)
    {
        if (this.blocks[addr >>> this.blockShift].untrapWrite(func)) {
            this.selectInterface(-1);
            return true;
        }
        return false;
    }
}

/*
 * A "dynamic" bus (eg, an I/O bus) is one where block accesses must always be performed via function (no direct
 * value access) because there's "logic" on the other end, whereas a "static" bus can be accessed either way, via
 * function or value.
 *
 * Why don't we use ONLY functions on dynamic buses and ONLY direct value access on static buses?  Partly for
 * historical reasons, but also because when trapping is enabled on one or more blocks of a bus, all accesses must
 * be performed via function, to ensure that the appropriate trap handler always gets invoked.
 *
 * This is why it's important that TYPE.DYNAMIC be 1 (not 0), because we pass that value to selectInterface()
 * to effectively force all block accesses on a "dynamic" bus to use function calls.
 */
Bus.TYPE = {
    STATIC:     0,
    DYNAMIC:    1
};

Defs.CLASSES["Bus"] = Bus;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/memory.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: (number|undefined), size: number, type: (number|undefined), littleEndian: (boolean|undefined), values: (Array.<number>|undefined) }} */
var MemoryConfig;

/**
 * @class {Memory}
 * @unrestricted
 * @property {number} [addr]
 * @property {number} size
 * @property {number} type
 * @property {Bus} bus
 * @property {number} dataWidth
 * @property {number} dataLimit
 * @property {number} pairLimit
 * @property {boolean} littleEndian
 * @property {ArrayBuffer|null} buffer
 * @property {DataView|null} dataView
 * @property {Array.<number>} values
 * @property {Array.<Uint16>|null} valuePairs
 * @property {Array.<Int32>|null} valueQuads
 * @property {boolean} fDirty
 * @property {number} nReadTraps
 * @property {number} nWriteTraps
 * @property {function((number|undefined),number,number)|null} readDataTrap
 * @property {function((number|undefined),number,number)|null} writeDataTrap
 * @property {function(number)|null} readDataOrig
 * @property {function(number,number)|null} writeDataOrig
 * @property {function(number)|null} readPairOrig
 * @property {function(number,number)|null} writePairOrig
 */
class Memory extends Device {
    /**
     * Memory(idMachine, idDevice, config)
     *
     * @this {Memory}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {MemoryConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        this.addr = config['addr'];
        this.size = config['size'];
        this.type = config['type'] || Memory.TYPE.NONE;

        /*
         * If no Bus ID was provided, then we fallback to the default Bus.
         */
        let idBus = this.config['bus'];
        this.bus = /** @type {Bus} */ (idBus? this.findDevice(idBus) : this.findDeviceByClass(idBus = "Bus"));
        if (!this.bus) throw new Error(this.sprintf("unable to find bus '%s'", idBus));

        this.dataWidth = this.bus.dataWidth;
        this.dataLimit = Math.pow(2, this.dataWidth) - 1;
        this.pairLimit = Math.pow(2, this.dataWidth * 2) - 1;

        this.littleEndian = this.bus.littleEndian !== false;
        this.buffer = this.dataView = null
        this.values = this.valuePairs = this.valueQuads = null;

        let readValue = this.readValue;
        let writeValue = this.writeValue;
        let readPair = this.readValuePair;
        let writePair = this.writeValuePair;

        if (this.bus.type == Bus.TYPE.STATIC) {
            writeValue = this.writeValueDirty;
            readPair = this.littleEndian? this.readValuePairLE : this.readValuePairBE;
            writePair = this.writeValuePairDirty;
            if (this.dataWidth == 8 && this.getMachineConfig('ArrayBuffer') !== false) {
                this.buffer = new ArrayBuffer(this.size);
                this.dataView = new DataView(this.buffer, 0, this.size);
                /*
                * If littleEndian is true, we can use valuePairs[] and valueQuads[] directly; well, we can use
                * them whenever the offset is a multiple of 1, 2 or 4, respectively.  Otherwise, we must fallback
                * to dv.getUint8()/dv.setUint8(), dv.getUint16()/dv.setUint16() and dv.getInt32()/dv.setInt32().
                */
                this.values = new Uint8Array(this.buffer, 0, this.size);
                this.valuePairs = new Uint16Array(this.buffer, 0, this.size >> 1);
                this.valueQuads = new Int32Array(this.buffer, 0, this.size >> 2);
                readPair = this.littleEndian == LITTLE_ENDIAN? this.readValuePair16 : this.readValuePair16SE;
            }
        }

        this.fDirty = false;
        this.initValues(config['values']);

        switch(this.type) {
        case Memory.TYPE.NONE:
            this.readData = this.readNone;
            this.writeData = this.writeNone;
            this.readPair = this.readNonePair;
            this.writePair = this.writeNone;
            break;
        case Memory.TYPE.READONLY:
            this.readData = readValue;
            this.writeData = this.writeNone;
            this.readPair = readPair;
            this.writePair = this.writeNone;
            break;
        case Memory.TYPE.READWRITE:
            this.readData = readValue;
            this.writeData = writeValue;
            this.readPair = readPair;
            this.writePair = writePair;
            break;
        default:

            break;
        }

        /*
         * Additional block properties used for trapping reads/writes
         */
        this.nReadTraps = this.nWriteTraps = 0;
        this.readDataTrap = this.writeDataTrap = null;
        this.readDataOrig = this.writeDataOrig = null;
        this.readPairOrig = this.writePairOrig = null;
    }

    /**
     * initValues(values)
     *
     * @this {Memory}
     * @param {Array.<number>|undefined} values
     */
    initValues(values)
    {
        if (!this.values) {
            if (values) {

                this.values = values;
            } else {
                this.values = new Array(this.size).fill(this.dataLimit);
            }
        } else {
            if (values) {

                for (let i = 0; i < this.size; i++) {

                    this.values[i] = values[i];
                }
            }
        }
    }

    /**
     * onReset()
     *
     * Called by the Bus device to provide notification of a reset event.
     *
     * NOTE: Machines probably don't (and shouldn't) depend on the initial memory contents being zero, but this
     * can't hurt, and if we decide to save memory blocks in a compressed format (eg, RLE), this will help them compress.
     *
     * @this {Memory}
     */
    onReset()
    {
        if (this.type >= Memory.TYPE.READWRITE) this.values.fill(0);
    }

    /**
     * isDirty()
     *
     * @this {Memory}
     * @return {boolean}
     */
    isDirty()
    {
        if (this.fDirty) {
            this.fDirty = false;
            this.writeData = this.writeValueDirty;
            this.writePair = this.writeValuePairDirty;
            return true;
        }
        return false;
    }

    /**
     * readNone(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readNone(offset)
    {
        return this.dataLimit;
    }

    /**
     * readNonePair(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readNonePair(offset)
    {
        if (this.littleEndian) {
            return this.readNone(offset) | (this.readNone(offset + 1) << this.dataWidth);
        } else {
            return this.readNone(offset + 1) | (this.readNone(offset) << this.dataWidth);
        }
    }

    /**
     * readValue(offset)
     *
     * @this {Memory}
     * @param {number} offset
     * @return {number}
     */
    readValue(offset)
    {
        return this.values[offset];
    }

    /**
     * readValuePair(offset)
     *
     * This slow version is used with a dynamic (ie, I/O) bus only.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair(offset)
    {
        if (this.littleEndian) {
            return this.readValue(offset) | (this.readValue(offset + 1) << this.dataWidth);
        } else {
            return this.readValue(offset + 1) | (this.readValue(offset) << this.dataWidth);
        }
    }

    /**
     * readValuePairBE(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePairBE(offset)
    {
        return this.values[offset + 1] | (this.values[offset] << this.dataWidth);
    }

    /**
     * readValuePairLE(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePairLE(offset)
    {
        return this.values[offset] | (this.values[offset + 1] << this.dataWidth);
    }

    /**
     * readValuePair16(offset)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair16(offset)
    {
        return this.valuePairs[offset >>> 1];
    }

    /**
     * readValuePair16SE(offset)
     *
     * This function is neither big-endian (BE) or little-endian (LE), but rather "swap-endian" (SE), which
     * means there's a mismatch between our emulated machine and the host machine, so we call the appropriate
     * DataView function with the desired littleEndian setting.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @return {number}
     */
    readValuePair16SE(offset)
    {
        return this.dataView.getUint16(offset, this.littleEndian);
    }

    /**
     * writeNone(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeNone(offset, value)
    {
    }

    /**
     * writeValue(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeValue(offset, value)
    {

        this.values[offset] = value;
    }

    /**
     * writeValueDirty(offset, value)
     *
     * @this {Memory}
     * @param {number} offset
     * @param {number} value
     */
    writeValueDirty(offset, value)
    {

        this.values[offset] = value;
        this.fDirty = true;
        this.writeData = this.writeValue;
    }

    /**
     * writeValuePair(offset, value)
     *
     * This slow version is used with a dynamic (ie, I/O) bus only.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair(offset, value)
    {
        if (this.littleEndian) {
            this.writeValue(offset, value & this.dataLimit);
            this.writeValue(offset + 1, value >> this.dataWidth);
        } else {
            this.writeValue(offset, value >> this.dataWidth);
            this.writeValue(offset + 1, value & this.dataLimit);
        }
    }

    /**
     * writeValuePairBE(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePairBE(offset, value)
    {

        this.values[offset] = value >> this.dataWidth;
        this.values[offset + 1] = value & this.dataLimit;
    }

    /**
     * writeValuePairLE(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePairLE(offset, value)
    {

        this.values[offset] = value & this.dataLimit;
        this.values[offset + 1] = value >> this.dataWidth;
    }

    /**
     * writeValuePair16(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair16(offset, value)
    {
        let off = offset >>> 1;

        this.valuePairs[off] = value;
    }

    /**
     * writeValuePair16SE(offset, value)
     *
     * This function is neither big-endian (BE) or little-endian (LE), but rather "swap-endian" (SE), which
     * means there's a mismatch between our emulated machine and the host machine, so we call the appropriate
     * DataView function with the desired littleEndian setting.
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset)
     * @param {number} value
     */
    writeValuePair16SE(offset, value)
    {

        this.dataView.setUint16(offset, value, this.littleEndian);
    }

    /**
     * writeValuePairDirty(offset, value)
     *
     * @this {Memory}
     * @param {number} offset (must be an even block offset, because we will halve it to obtain a pair offset)
     * @param {number} value
     */
    writeValuePairDirty(offset, value)
    {
        if (!this.buffer) {
            if (this.littleEndian) {
                this.writeValuePairLE(offset, value);
                this.writePair = this.writeValuePairLE;
            } else {
                this.writeValuePairBE(offset, value);
                this.writePair = this.writeValuePairBE;
            }
        } else {
            if (this.littleEndian == LITTLE_ENDIAN) {
                this.writeValuePair16(offset, value);
                this.writePair = this.writeValuePair16;
            } else {
                this.writeValuePair16SE(offset, value);
                this.writePair = this.writeValuePair16SE;
            }
        }
    }

    /**
     * trapRead(func)
     *
     * I've decided to call the trap handler AFTER reading the value, so that we can pass the value
     * along with the address; for example, the Debugger might find that useful for its history buffer.
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the
     * original address, only the block offset.
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapRead(func)
    {
        if (!this.nReadTraps) {
            let block = this;
            this.nReadTraps = 1;
            this.readTrap = func;
            this.readDataOrig = this.readData;
            this.readPairOrig = this.readPair;
            this.readData = function(offset) {
                let value = block.readDataOrig(offset);
                block.readTrap(block.addr, offset, value);
                return value;
            };
            this.readPair = function(offset) {
                let value = block.readPairOrig(offset);
                block.readTrap(block.addr, offset, value);
                block.readTrap(block.addr, offset + 1, value);
                return value;
            };
            return true;
        }
        if (this.readTrap == func) {
            this.nReadTraps++;
            return true;
        }
        return false;
    }

    /**
     * trapWrite(func)
     *
     * Note that for blocks of type NONE, the base will be undefined, so function will not see the original address,
     * only the block offset.
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if trap successful, false if unsupported already trapped by another function
     */
    trapWrite(func)
    {
        if (!this.nWriteTraps) {
            let block = this;
            this.nWriteTraps = 1;
            this.writeTrap = func;
            this.writeDataOrig = this.writeData;
            this.writePairOrig = this.writePair;
            this.writeData = function(offset, value) {
                block.writeTrap(block.addr, offset, value);
                block.writeDataOrig(offset, value);
            };
            this.writePair = function(offset, value) {
                block.writeTrap(block.addr, offset, value);
                block.writeTrap(block.addr, offset + 1, value);
                block.writePairOrig(offset, value);
            };
            return true;
        }
        if (this.writeTrap == func) {
            this.nWriteTraps++;
            return true
        }
        return false;
    }

    /**
     * untrapRead(func)
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value read)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapRead(func)
    {
        if (this.nReadTraps && this.readTrap == func) {
            if (!--this.nReadTraps) {
                this.readData = this.readDataOrig;
                this.readPair = this.readPairOrig;
                this.readDataOrig = this.readPairOrig = this.readTrap = undefined;
            }

            return true;
        }
        return false;
    }

    /**
     * untrapWrite(func)
     *
     * @this {Memory}
     * @param {function((number|undefined), number, number)} func (receives the base address, offset, and value written)
     * @return {boolean} true if untrap successful, false if no (or another) trap was in effect
     */
    untrapWrite(func)
    {
        if (this.nWriteTraps && this.writeTrap == func) {
            if (!--this.nWriteTraps) {
                this.writeData = this.writeDataOrig;
                this.writePair = this.writePairOrig;
                this.writeDataOrig = this.writePairOrig = this.writeTrap = undefined;
            }

            return true;
        }
        return false;
    }

    /**
     * loadState(state)
     *
     * Memory and Ports states are loaded by the Bus onLoad() handler, which calls our loadState() handler.
     *
     * @this {Memory}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.fDirty = state.shift();
            state.shift();      // formerly fDirtyEver, now unused
            this.initValues(this.decompress(state.shift(), this.size));
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * Memory and Ports states are saved by the Bus onSave() handler, which calls our saveState() handler.
     *
     * @this {Memory}
     * @param {Array} state
     */
    saveState(state)
    {
        state.push(this.idDevice);
        state.push(this.fDirty);
        state.push(false);      // formerly fDirtyEver, now unused
        state.push(this.compress(this.values));
    }
}

/*
 * Memory block types use discrete bits so that enumBlocks() can be passed a set of combined types,
 * by OR'ing the desired types together.
 */
Memory.TYPE = {
    NONE:               0x01,
    READONLY:           0x02,
    READWRITE:          0x04,
    /*
     * The rest are not discrete memory types, but rather sets of types that are handy for enumBlocks().
     */
    READABLE:           0x0E,
    WRITABLE:           0x0C
};

Defs.CLASSES["Memory"] = Memory;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/ports.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: number, size: number }} */
var PortsConfig;

/**
 * @class {Ports}
 * @unrestricted
 * @property {PortsConfig} config
 * @property {number} addr
 * @property {number} size
 * @property {number} type
 * @property {Object.<function(number)>} aInputs
 * @property {Object.<function(number,number)>} aOutputs
 */
class Ports extends Memory {
    /**
     * Ports(idMachine, idDevice, config)
     *
     * @this {Ports}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {PortsConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        this.bus.addBlocks(config['addr'], config['size'], config['type'], this);
        this.aInputs = {};
        this.aOutputs = {};
    }

    /**
     * addListener(port, input, output, device)
     *
     * @this {Ports}
     * @param {number} port
     * @param {function(number)|null} [input]
     * @param {function(number,number)|null} [output]
     * @param {Device} [device]
     */
    addListener(port, input, output, device)
    {
        if (input) {
            if (this.aInputs[port]) {
                throw new Error(this.sprintf("input listener for port %#0x already exists", port));
            }
            this.aInputs[port] = input.bind(device || this);
        }
        if (output) {
            if (this.aOutputs[port]) {
                throw new Error(this.sprintf("output listener for port %#0x already exists", port));
            }
            this.aOutputs[port] = output.bind(device || this);
        }
    }

    /**
     * readNone(offset)
     *
     * This overrides the default readNone() function, which is the default handler for all I/O ports.
     *
     * @this {Ports}
     * @param {number} offset
     * @return {number}
     */
    readNone(offset)
    {
        let port = this.addr + offset;
        let func = this.aInputs[port];
        if (func) {
            return func(port);
        }
        this.printf(MESSAGE.PORTS + MESSAGE.MISC, "readNone(%#04x): unknown port\n", port);
        return super.readNone(offset);
    }

    /**
     * writeNone(offset)
     *
     * This overrides the default writeNone() function, which is the default handler for all I/O ports.
     *
     * @this {Ports}
     * @param {number} offset
     * @param {number} value
     */
    writeNone(offset, value)
    {
        let port = this.addr + offset;
        let func = this.aOutputs[port];
        if (func) {
            func(port, value);
            return;
        }
        this.printf(MESSAGE.PORTS + MESSAGE.MISC, "writeNone(%#04x,%#04x): unknown port\n", port, value);
        super.writeNone(offset, value);
    }
}

Defs.CLASSES["Ports"] = Ports;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/ram.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: number, size: number, type: (number|undefined) }} */
var RAMConfig;

/**
 * @class {RAM}
 * @unrestricted
 * @property {RAMConfig} config
 * @property {number} addr
 * @property {number} size
 * @property {number} type
 * @property {Array.<number>} values
 */
class RAM extends Memory {
    /**
     * RAM(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "ram": {
     *        "class": "RAM",
     *        "addr": 8192,
     *        "size": 1024,
     *        "bus": "busMemory"
     *      }
     *
     * @this {RAM}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {RAMConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        config['type'] = Memory.TYPE.READWRITE;
        super(idMachine, idDevice, config);
        this.bus.addBlocks(config['addr'], config['size'], config['type'], this);
    }

    /**
     * reset()
     *
     * @this {RAM}
     */
    reset()
    {
    }
}

Defs.CLASSES["RAM"] = RAM;

/**
 * @copyright https://www.pcjs.org/modules/devices/bus/rom.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ addr: number, size: number, values: Array.<number>, file: string, reference: string, chipID: string, revision: (number|undefined), colorROM: (string|undefined), backgroundColorROM: (string|undefined) }} */
var ROMConfig;

/**
 * @class {ROM}
 * @unrestricted
 * @property {ROMConfig} config
 */
class ROM extends Memory {
    /**
     * ROM(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "rom": {
     *        "class": "ROM",
     *        "addr": 0,
     *        "size": 2048,
     *        "bus": "busIO"
     *        "littleEndian": true,
     *        "file": "ti57le.bin",
     *        "reference": "",
     *        "chipID": "TMC1501NC DI 7741",
     *        "revision": "0",
     *        "bindings": {
     *          "array": "romArrayTI57",
     *          "cellDesc": "romCellTI57"
     *        },
     *        "overrides": ["colorROM","backgroundColorROM"],
     *        "values": [
     *          ...
     *        ]
     *      }
     *
     * @this {ROM}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {ROMConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        config['type'] = Memory.TYPE.READONLY;
        super(idMachine, idDevice, config);

        /*
         * The Memory constructor automatically finds the correct Bus for us.
         */
        this.bus.addBlocks(config['addr'], config['size'], config['type'], this);
        this.cpu = this.dbg = undefined;

        /*
         * If an "array" binding has been supplied, then create an LED array sufficiently large to represent the
         * entire ROM.  If data.length is an odd power-of-two, then we will favor a slightly wider array over a taller
         * one, by virtue of using Math.ceil() instead of Math.floor() for the columns calculation.
         */
        if (Defs.CLASSES["LED"] && this.bindings[ROM.BINDING.ARRAY]) {
            let rom = this;
            let addrLines = Math.log2(this.values.length) / 2;
            this.cols = Math.pow(2, Math.ceil(addrLines));
            this.rows = (this.values.length / this.cols)|0;
            let configLEDs = {
                "class":            "LED",
                "bindings":         {"container": this.getBindingID(ROM.BINDING.ARRAY)},
                "type":             LED.TYPE.ROUND,
                "cols":             this.cols,
                "rows":             this.rows,
                "color":            this.getDefaultString('colorROM', "green"),
                "backgroundColor":  this.getDefaultString('backgroundColorROM', "black"),
                "persistent":       true
            };
            this.ledArray = new LED(idMachine, idDevice + "LEDs", configLEDs);
            this.clearArray();
            let configInput = {
                "class":        "Input",
                "location":     [0, 0, this.ledArray.widthView, this.ledArray.heightView, this.cols, this.rows],
                "bindings":     {"surface": this.getBindingID(ROM.BINDING.ARRAY)}
            };
            this.ledInput = new Input(idMachine, idDevice + "Input", configInput);
            this.sCellDesc = this.getBindingText(ROM.BINDING.CELLDESC) || "";
            this.ledInput.addHover(function onROMHover(col, row) {
                if (rom.cpu) {
                    let sDesc = rom.sCellDesc;
                    if (col >= 0 && row >= 0) {
                        let offset = row * rom.cols + col;

                        let opcode = rom.values[offset];
                        sDesc = rom.cpu.toInstruction(rom.addr + offset, opcode);
                    }
                    rom.setBindingText(ROM.BINDING.CELLDESC, sDesc);
                }
            });
        }
    }

    /**
     * clearArray()
     *
     * clearBuffer(true) performs a combination of clearBuffer() and drawBuffer().
     *
     * @this {ROM}
     */
    clearArray()
    {
        if (this.ledArray) this.ledArray.clearBuffer(true);
    }

    /**
     * drawArray()
     *
     * This performs a simple drawBuffer(); intended for synchronous updates (eg, step operations);
     * otherwise, you should allow the LED object's async animation handler take care of drawing updates.
     *
     * @this {ROM}
     */
    drawArray()
    {
        if (this.ledArray) this.ledArray.drawBuffer();
    }

    /**
     * loadState(state)
     *
     * If any saved values don't match (presumably overridden), abandon the given state and return false.
     *
     * @this {ROM}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let length, success = true;
        let buffer = state.shift();
        if (buffer && this.ledArray) {
            length = buffer.length;

            if (this.ledArray.buffer.length == length) {
                this.ledArray.buffer = buffer;
                this.ledArray.drawBuffer(true);
            } else {
                this.printf("inconsistent saved LED state (%d), unable to load\n", length);
                success = false;
            }
        }
        /*
         * Version 1.21 and up also saves the ROM contents, since our "mini-debugger" has been updated
         * with an edit command ("e") to enable ROM patching.  However, we prefer to detect improvements
         * in saved state based on the length of the array, not the version number.
         */
        if (state.length) {
            let data = state.shift();
            let length = data && data.length || -1;
            if (this.values.length == length) {
                this.values = data;
            } else {
                this.printf("inconsistent saved ROM state (%d), unable to load\n", length);
                success = false;
            }
        }
        return success;
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {ROM}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        /*
         * We only care about the first power event, because it's a safe point to query the CPU.
         */
        if (this.cpu === undefined) {
            this.cpu = /* @type {CPU} */ (this.findDeviceByClass("CPU"));
        }
        /*
         * This is also a good time to get access to the Debugger, if any, and pass it symbol information, if any.
         */
        if (this.dbg === undefined) {
            this.dbg = /* @type {Debugger} */ (this.findDeviceByClass("Debugger", false));
            if (this.dbg && this.dbg.addSymbols) this.dbg.addSymbols(this.config['symbols']);
        }
    }

    /**
     * readDirect(offset)
     *
     * This provides an alternative to readValue() for those callers who don't want the LED array to see their access.
     *
     * Note that this "Direct" function requires the caller to perform their own address-to-offset calculation, since they
     * are bypassing the Bus device.
     *
     * @this {ROM}
     * @param {number} offset
     * @return {number}
     */
    readDirect(offset)
    {
        return this.values[offset];
    }

    /**
     * readValue(offset)
     *
     * This overrides the Memory readValue() function so that the LED array, if any, can track ROM accesses.
     *
     * @this {ROM}
     * @param {number} offset
     * @return {number}
     */
    readValue(offset)
    {
        if (this.ledArray) {
            this.ledArray.setLEDState(offset % this.cols, (offset / this.cols)|0, LED.STATE.ON, LED.FLAGS.MODIFIED);
        }
        return this.values[offset];
    }

    /**
     * reset()
     *
     * Called by the CPU (eg, TMS1500) onReset() handler.  Originally, there was no need for this
     * handler, until we added the mini-debugger's ability to edit ROM locations via setData().  So this
     * gives the user the ability to revert back to the original ROM if they want to undo any modifications.
     *
     * @this {ROM}
     */
    reset()
    {
        this.values = this.config['values'];
    }

    /**
     * saveState(state)
     *
     * @this {ROM}
     * @param {Array} state
     */
    saveState(state)
    {
        if (this.ledArray) {
            state.push(this.ledArray.buffer);
            state.push(this.values);
        }
    }

    /**
     * writeDirect(offset, value)
     *
     * This provides an alternative to writeValue() for callers who need to "patch" the ROM (normally unwritable).
     *
     * Note that this "Direct" function requires the caller to perform their own address-to-offset calculation, since they
     * are bypassing the Bus device.
     *
     * @this {ROM}
     * @param {number} offset
     * @param {number} value
     */
    writeDirect(offset, value)
    {
        this.values[offset] = value;
    }
}

ROM.BINDING = {
    ARRAY:      "array",
    CELLDESC:   "cellDesc"
};

Defs.CLASSES["ROM"] = ROM;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/input.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), location: Array.<number>, map: (Array.<Array.<number>>|Object|undefined), drag: (boolean|undefined), scroll: (boolean|undefined), hexagonal: (boolean|undefined), buttonDelay: (number|undefined) }} */
var InputConfig;

 /** @typedef {{ keyCode: number, msDown: number, autoRelease: boolean }} */
var ActiveKey;

 /** @typedef {{ id: string, func: function(string,boolean) }} */
var KeyListener;

 /** @typedef {{ id: string, cxGrid: number, cyGrid: number, xGrid: number, yGrid: number, func: function(boolean) }} */
var SurfaceListener;

/**
 * @class {Input}
 * @unrestricted
 * @property {InputConfig} config
 * @property {Array.<number>} location
 * @property {Array.<Array.<number>>|Object} map
 * @property {boolean} fDrag
 * @property {boolean} fScroll
 * @property {boolean} fHexagonal
 * @property {number} buttonDelay
 * @property {{
 *  surface: Element|undefined
 * }} bindings
 * @property {function(number,number)} onInput
 * @property {function(number,number)} onHover
 * @property {Array.<KeyListener>} aKeyListeners
 * @property {Array.<SurfaceListener>} aSurfaceListeners
 * @property {Array.<ActiveKey>} aKeysActive
 */
class Input extends Device {
    /**
     * Input(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "input": {
     *        "class": "Input",
     *        "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853],
     *        "map": [
     *          ["2nd",  "inv",  "lnx",  "\\b",  "clr"],
     *          ["lrn",  "xchg", "sq",   "sqrt", "rcp"],
     *          ["sst",  "sto",  "rcl",  "sum",  "exp"],
     *          ["bst",  "ee",   "(",    ")",    "/"],
     *          ["gto",  "7",    "8",    "9",    "*"],
     *          ["sbr",  "4",    "5",    "6",    "-"],
     *          ["rst",  "1",    "2",    "3",    "+"],
     *          ["r/s",  "0",    ".",    "+/-",  "=|\\r"]
     *        ],
     *        "drag": false,
     *        "bindings": {
     *          "surface": "imageTI57",
     *          "power": "powerTI57",
     *          "reset": "resetTI57"
     *        }
     *      }
     *
     * A word about the "power" button: the page will likely use absolute positioning to overlay the HTML button
     * onto the image of the physical button, and the temptation might be to use the style "display:none" to hide
     * it, but "opacity:0" should be used instead, because otherwise our efforts to use it as focusable element
     * may fail.
     *
     * @this {Input}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {InputConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        this.onInput = this.onHover = null;
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.machine = /** @type {Machine} */ (this.findDeviceByClass("Machine"));

        /*
         * If 'drag' is true, then the onInput() handler will be called whenever the current col and/or row
         * changes, even if the mouse hasn't been released since the previous onInput() call.
         *
         * The default is false, because in general, allowing drag is a bad idea for calculator buttons.  But
         * I've made this an option for other input surfaces, like LED arrays, where you might want to turn a
         * series of LEDs on or off.
         */
        this.fDrag = this.getDefaultBoolean('drag', false);

        /*
         * If 'scroll' is true, then we do NOT call preventDefault() on touch events; this permits the input
         * surface to be scrolled like any other part of the page.  The default is false, because this has other
         * side-effects (eg, inadvertent zooms).
         */
        this.fScroll = this.getDefaultBoolean('scroll', false);

        /*
         * If 'hexagonal' is true, then we treat the input grid as hexagonal, where even rows of the associated
         * display are offset.
         */
        this.fHexagonal = this.getDefaultBoolean('hexagonal', false);

        /*
         * The 'buttonDelay' setting is only necessary for devices (ie, old calculators) that are either slow
         * to respond and/or have debouncing logic that would otherwise be defeated.
         */
        this.buttonDelay = this.getDefaultNumber('buttonDelay', 0);

        /*
         * This is set on receipt of the first 'touch' event of any kind, and is used by the 'mouse' event
         * handlers to disregard mouse events if set.
         */
        this.fTouch = false;

        /*
         * There are two supported configuration maps: a two-dimensional grid (gridMap) and a list of IDs (idMap).
         *
         * The two-dimensional button layouts do not (currently) support individual listeners; instead, any key event
         * that corresponds to a position within the button layout is transformed into an (x,y) position that is passed
         * on to a special function supplied to addInput().
         *
         * Any two-dimensional layout COULD be converted to a list of logical buttons, each with their own grid
         * coordinates, but for devices like calculators that have a natural grid design, the two-dimensional layout
         * is much simpler.
         *
         * Each ID in an idMap references an object with a "keys" array, a "grid" array, and a "state" value;
         * the code below ensures that every object has all three.  As "keys" go down and up (or mouse/touch events
         * occur within the "grid"), the corresponding "state" is updated (0 or 1).
         *
         * A third type of map (keyMap) is supported, but not as a configuration parameter; any keyMap must be supplied
         * by another device, via an addKeyMap() call.
         */
        let map = this.config['map'];
        this.gridMap = this.idMap = this.keyMap = null;

        if (map) {
            if (map.length) {
                this.gridMap = map;
            } else {
                this.idMap = {};
                let ids = Object.keys(map);
                for (let i = 0; i < ids.length; i++) {
                    let grid = [];
                    let id = ids[i];
                    let keys = map[id];
                    if (typeof keys == "string") {
                        keys = [keys];
                    } else if (keys.length == undefined) {
                        grid = keys['grid'];
                        keys = keys['keys'];
                        if (typeof keys == "string") keys = [keys];
                    }
                    let state = 0;
                    this.idMap[id] = {keys, grid, state};
                }
            }
        }

        this.focusElement = null;
        let element = this.bindings[Input.BINDING.SURFACE];
        if (element) {
            this.addSurface(element, this.findBinding(Input.BINDING.POWER, true), this.config['location']);
        }

        this.aKeyListeners = [];
        this.aSurfaceListeners = [];

        this.onReset();
    }

    /**
     * addHover(onHover)
     *
     * @this {Input}
     * @param {function(number,number)} onHover
     */
    addHover(onHover)
    {
        this.onHover = onHover;
    }

    /**
     * addInput(onInput)
     *
     * Called by the CPU device to set up input notifications.
     *
     * @this {Input}
     * @param {function(number,number)} onInput
     */
    addInput(onInput)
    {
        this.onInput = onInput;
    }

    /**
     * addListener(type, id, func, init)
     *
     * @this {Input}
     * @param {string} type (see Input.TYPE)
     * @param {string} id
     * @param {function(string,boolean)|null} [func]
     * @param {number|boolean|string} [init] (initial state; treated as a boolean for the SWITCH type)
     * @return {boolean} (true if successful, false if not)
     */
    addListener(type, id, func, init)
    {
        if (type == Input.TYPE.IDMAP && this.idMap) {
            let map = this.idMap[id];
            if (map) {
                let keys = map.keys;
                if (keys && keys.length) {
                    this.aKeyListeners.push({id, func});
                }
                let grid = map.grid;
                if (grid && grid.length) {
                    this.aSurfaceListeners.push({id, cxGrid: grid[0], cyGrid: grid[1], xGrid: grid[2], yGrid: grid[3], func});
                }
                return true;
            }
            return false;
        }
        /*
         * The visual state of a SWITCH control (which could be a div or button or any other element) is controlled
         * by its class attribute -- specifically, the last class name in the attribute.  You must define two classes:
         * one that ends with "On" for the on (true) state and another that ends with "Off" for the off (false) state.
         *
         * The first addListener() call should include both your listener function and the initial state; the control's
         * class is automatically switched every time the control is clicked, and the newly switched state is passed to
         * your function.  If you need to change the state of the switch for other reasons, call addListener() with NO
         * function, just a new initial state.
         */
        if (type == Input.TYPE.SWITCH) {
            let element = this.findBinding(id, true);
            if (element) {
                let getClass = function() {
                    return element.getAttribute("class") || "";
                };
                let setClass = function(s) {
                    element.setAttribute("class", s);
                };
                let getState = function() {
                    return (getClass().slice(-2) == "On")? true : false;
                };
                let setState = function(state) {
                    setClass(getClass().replace(/(On|Off)$/, state? "On" : "Off"));
                    return state;
                };
                if (init != undefined) setState(init);
                if (func) {
                    element.addEventListener('click', function() {
                        func(id, setState(!getState()));
                    });
                }
            }
            return false;
        }
        return false;
    }

    /**
     * addKeyMap(keyMap)
     *
     * @this {Input}
     * @param {Object} keyMap
     * @return {boolean}
     */
    addKeyMap(keyMap)
    {
        if (!this.keyMap) {
            let input = this;
            this.keyMap = keyMap;
            this.timerAutoRelease = this.time.addTimer("timerAutoRelease", function onAutoRelease() {
                input.checkAutoRelease();
            });
            return true;
        }
        return false;
    }

    /**
     * checkKeyListeners(id, down)
     *
     * @this {Input}
     * @param {string} id
     * @param {boolean} down
     */
    checkKeyListeners(id, down)
    {
        for (let i = 0; i < this.aKeyListeners.length; i++) {
            let listener = this.aKeyListeners[i];
            if (listener.id == id) {
                listener.func(id, down);
            }
        }
    }

    /**
     * addSurface(element, focusElement, location)
     *
     * @this {Input}
     * @param {Element} element (surface element)
     * @param {Element} [focusElement] (should be provided if surface element is non-focusable)
     * @param {Array} [location]
     */
    addSurface(element, focusElement, location = [])
    {
        /*
         * The location array, eg:
         *
         *      "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853, 180, 418, 75, 36],
         *
         * contains the top left corner (xInput, yInput) and dimensions (cxInput, cyInput)
         * of the input rectangle where the buttons described in the map are located, relative
         * to the surface image.  It also describes the average amount of horizontal and vertical
         * space between buttons, as fractions of the average button width and height (hGap, vGap).
         *
         * With all that, we can now calculate the center lines for each column and row.  This
         * obviously assumes that all the buttons are evenly laid out in a perfect grid.  For
         * devices that don't have such a nice layout, a different location array format will
         * have to be defined.
         *
         * NOTE: While element.naturalWidth and element.naturalHeight should, for all modern
         * browsers, contain the surface image's dimensions as well, those values still might not
         * be available if our constructor is called before the page's onload event has fired,
         * so we allow them to be stored in the next two elements of the location array, too.
         *
         * Finally, the position and size of the device's power button may be stored in the array
         * as well, in case some browsers refuse to generate onClickPower() events (eg, if they
         * think the button is inaccessible/not visible).
         */
        this.xInput = location[0] || 0;
        this.yInput = location[1] || 0;
        this.cxInput = location[2] || element.clientWidth;
        this.cyInput = location[3] || element.clientHeight;
        this.hGap = location[4] || 1.0;
        this.vGap = location[5] || 1.0;
        this.cxSurface = location[6] || element.naturalWidth || this.cxInput;
        this.cySurface = location[7] || element.naturalHeight || this.cyInput;
        this.xPower = location[8] || 0;
        this.yPower = location[9] || 0;
        this.cxPower = location[10] || 0;
        this.cyPower = location[11] || 0;
        if (this.gridMap) {
            this.nRows = this.gridMap.length;
            this.nCols = this.gridMap[0].length;
        } else {
            this.nCols = this.hGap;
            this.nRows = this.vGap;
            this.hGap = this.vGap = 0;
        }

        /*
         * To calculate the average button width (cxButton), we know that the overall width
         * must equal the sum of all the button widths + the sum of all the button gaps:
         *
         *      cxInput = nCols * cxButton + nCols * (cxButton * hGap)
         *
         * The number of gaps would normally be (nCols - 1), but we require that cxInput include
         * only 1/2 the gap at the edges, too.  Solving for cxButton:
         *
         *      cxButton = cxInput / (nCols + nCols * hGap)
         */
        this.cxButton = (this.cxInput / (this.nCols + this.nCols * this.hGap))|0;
        this.cyButton = (this.cyInput / (this.nRows + this.nRows * this.vGap))|0;
        this.cxGap = (this.cxButton * this.hGap)|0;
        this.cyGap = (this.cyButton * this.vGap)|0;

        /*
         * xStart and yStart record the last 'touchstart' or 'mousedown' position on the surface
         * image; they will be reset to -1 when movement has ended (eg, 'touchend' or 'mouseup').
         */
        this.xStart = this.yStart = -1;

        this.captureMouse(element);
        this.captureTouch(element);

        if (this.time) {
            /*
             * We use a timer for the touch/mouse release events, to ensure that the machine had
             * enough time to notice the input before releasing it.
             */
            let input = this;
            if (this.buttonDelay) {
                this.timerInputRelease = this.time.addTimer("timerInputRelease", function onInputRelease() {
                    if (input.xStart < 0 && input.yStart < 0) { // auto-release ONLY if it's REALLY released
                        input.setPosition(-1, -1);
                    }
                });
            }
            if (this.gridMap || this.idMap || this.keyMap) {
                /*
                 * This auto-releases the last key reported after an appropriate delay, to ensure that
                 * the machine had enough time to notice the corresponding button was pressed.
                 */
                if (this.buttonDelay) {
                    this.timerKeyRelease = this.time.addTimer("timerKeyRelease", function onKeyRelease() {
                        input.onKeyTimer();
                    });
                }

                /*
                 * I used to maintain a single-key buffer (this.keyPressed) and would immediately release
                 * that key as soon as another key was pressed, but it appears that the ROM wants a minimum
                 * delay between release and the next press -- probably for de-bouncing purposes.  So we
                 * maintain a key state: 0 means no key has gone down or up recently, 1 means a key just went
                 * down, and 2 means a key just went up.  keysPressed maintains a queue of keys (up to 16)
                 * received while key state is non-zero.
                 */
                this.keyState = 0;
                this.keyActive = "";
                this.keysPressed = [];

                /*
                 * I'm attaching my 'keypress' handlers to the document object, since image elements are
                 * not focusable.  I'm disinclined to do what I've done with other machines (ie, create an
                 * invisible <textarea> overlay), because in this case, I don't really want a soft keyboard
                 * popping up and obscuring part of the display.
                 *
                 * A side-effect, however, is that if the user attempts to explicitly give the image
                 * focus, we don't have anything for focus to attach to.  We address that in onMouseDown(),
                 * by redirecting focus to the "power" button, if any, not because we want that or any other
                 * button to have focus, but simply to remove focus from any other input element on the page.
                 */
                this.captureKeys(focusElement? document : element);
                if (!this.focusElement && focusElement) this.focusElement = focusElement;
            }
        }
    }

    /**
     * checkSurfaceListeners(action, x, y, cx, cy)
     *
     * @this {Input}
     * @param {number} action (eg, Input.ACTION.MOVE, Input.ACTION.PRESS, Input.ACTION.RELEASE)
     * @param {number} x (valid for MOVE and PRESS, not RELEASE)
     * @param {number} y (valid for MOVE and PRESS, not RELEASE)
     * @param {number} cx (width of the element that received the event)
     * @param {number} cy (height of the element that received the event)
     */
    checkSurfaceListeners(action, x, y, cx, cy)
    {
        if (action == Input.ACTION.PRESS || action == Input.ACTION.RELEASE) {
            for (let i = 0; i < this.aSurfaceListeners.length; i++) {
                let listener = this.aSurfaceListeners[i];
                if (action == Input.ACTION.RELEASE) {
                    listener.func(listener.id, false);
                    continue;
                }
                let cxSpan = (cx / listener.cxGrid)|0, xActive = (x / cxSpan)|0;
                let cySpan = (cy / listener.cyGrid)|0, yActive = (y / cySpan)|0;
                if (xActive == listener.xGrid && yActive == listener.yGrid) {
                    listener.func(listener.id, true);
                }
            }
        }
    }

    /**
     * advanceKeyState()
     *
     * @this {Input}
     */
    advanceKeyState()
    {
        if (!this.buttonDelay) {
            this.onKeyTimer();
        } else {
            this.time.setTimer(this.timerKeyRelease, this.buttonDelay);
        }
    }

    /**
     * captureKeys(element)
     *
     * @this {Input}
     * @param {Document|Element} element
     */
    captureKeys(element)
    {
        let input = this;

        element.addEventListener(
            'keydown',
            function onKeyDown(event) {
                event = event || window.event;
                let activeElement = document.activeElement;
                if (!input.focusElement || activeElement == input.focusElement) {
                    let keyCode = event.which || event.keyCode;
                    let used = input.onKeyEvent(keyCode, true);
                    input.printf(MESSAGE.KEY + MESSAGE.EVENT, "onKeyDown(keyCode=%#04x): %5.2f (%s)\n", keyCode, (Date.now() / 1000) % 60, used? "used" : "unused");
                    if (used) event.preventDefault();
                }
            }
        );
        element.addEventListener(
            'keypress',
            function onKeyPress(event) {
                event = event || window.event;
                let charCode = event.which || event.charCode;
                let used = input.onKeyEvent(charCode);
                input.printf(MESSAGE.KEY + MESSAGE.EVENT, "onKeyPress(charCode=%#04x): %5.2f (%s)\n", charCode, (Date.now() / 1000) % 60, used? "used" : "unused");
                if (used) event.preventDefault();
            }
        );
        element.addEventListener(
            'keyup',
            function onKeyUp(event) {
                event = event || window.event;
                let activeElement = document.activeElement;
                if (!input.focusElement || activeElement == input.focusElement) {
                    let keyCode = event.which || event.keyCode;
                    input.onKeyEvent(keyCode, false);
                    input.printf(MESSAGE.KEY + MESSAGE.EVENT, "onKeyUp(keyCode=%#04x): %5.2f (ignored)\n", keyCode, (Date.now() / 1000) % 60);
                }
            }
        );
    }

    /**
     * captureMouse(element)
     *
     * @this {Input}
     * @param {Element} element
     */
    captureMouse(element)
    {
        let input = this;

        element.addEventListener(
            'mousedown',
            function onMouseDown(event) {
                if (input.fTouch) return;
                /*
                 * If there are any text input elements on the page that might currently have focus,
                 * this is a good time to divert focus to a focusable element of our own (eg, focusElement).
                 * Otherwise, key presses could be confusingly processed in two places.
                 *
                 * Unfortunately, setting focus on an element can cause the browser to scroll the element
                 * into view, so to avoid that, we use the following scrollTo() work-around.
                 */
                if (input.focusElement) {
                    let x = window.scrollX, y = window.scrollY;
                    input.focusElement.focus();
                    window.scrollTo(x, y);
                }
                if (!event.button) {
                    input.onSurfaceEvent(element, Input.ACTION.PRESS, event);
                }
            }
        );

        element.addEventListener(
            'mousemove',
            function onMouseMove(event) {
                if (input.fTouch) return;
                input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
            }
        );

        element.addEventListener(
            'mouseup',
            function onMouseUp(event) {
                if (input.fTouch) return;
                if (!event.button) {
                    input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
                }
            }
        );

        element.addEventListener(
            'mouseout',
            function onMouseOut(event) {
                if (input.fTouch) return;
                if (input.xStart < 0) {
                    input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
                } else {
                    input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
                }
            }
        );
    }

    /**
     * captureTouch(element)
     *
     * @this {Input}
     * @param {Element} element
     */
    captureTouch(element)
    {
        let input = this;

        /*
         * NOTE: The mouse event handlers below deal only with events where the left button is involved
         * (ie, left button is pressed, down, or released).
         */
        element.addEventListener(
            'touchstart',
            function onTouchStart(event) {
                /*
                 * Under normal circumstances (ie, when fScroll is false), when any touch events arrive,
                 * onSurfaceEvent() calls preventDefault(), which prevents a variety of potentially annoying
                 * behaviors (ie, zooming, scrolling, fake mouse events, etc).  Under non-normal circumstances,
                 * (ie, when fScroll is true), we set fTouch on receipt of a 'touchstart' event, which will
                 * help our mouse event handlers avoid any redundant actions due to fake mouse events.
                 */
                if (input.fScroll) input.fTouch = true;
                input.onSurfaceEvent(element, Input.ACTION.PRESS, event);
            }
        );

        element.addEventListener(
            'touchmove',
            function onTouchMove(event) {
                input.onSurfaceEvent(element, Input.ACTION.MOVE, event);
            }
        );

        element.addEventListener(
            'touchend',
            function onTouchEnd(event) {
                input.onSurfaceEvent(element, Input.ACTION.RELEASE, event);
            }
        );
    }

    /**
     * checkAutoRelease()
     *
     * Auto-release handler for active keys.
     *
     * @this {Input}
     */
    checkAutoRelease()
    {
        let i = 0;
        let msDelayMin = -1;
        while (i < this.aKeysActive.length) {
            if (this.aKeysActive[i].autoRelease) {
                let keyCode = this.aKeysActive[i].keyCode;
                let msDown = this.aKeysActive[i].msDown;
                let msElapsed = Date.now() - msDown;
                let msDelay = Input.BUTTON_DELAY - msElapsed;
                if (msDelay > 0) {
                    if (msDelayMin < 0 || msDelayMin > msDelay) {
                        msDelayMin = msDelay;
                    }
                } else {
                    /*
                     * Because the key is already in the auto-release state, this next call guarantees that the
                     * key will be removed from the array; a consequence of that removal, however, is that we must
                     * reset our array index to zero.
                     */
                    this.onKeyEvent(keyCode, false);
                    i = 0;
                    continue;
                }
            }
            i++;
        }
        if (msDelayMin >= 0) {
            this.time.setTimer(this.timerAutoRelease, msDelayMin);
        }
    }

    /**
     * getActiveKey(i, useMap)
     *
     * @this {Input}
     * @param {number} i
     * @param {boolean} useMap (true to return mapped key)
     * @return {number} (the requested active key, 0 if none)
     */
    getActiveKey(i, useMap=false)
    {
        let value = 0;
        if (i < this.aKeysActive.length) {
            let keyCode = this.aKeysActive[i].keyCode;
            value = useMap && this.keyMap? this.keyMap[keyCode] : keyCode;
        }
        return value;
    }

    /**
     * getKeyState(id)
     *
     * @this {Input}
     * @param {string} id
     * @return {number|undefined} 1 if down, 0 if up, undefined otherwise
     */
    getKeyState(id)
    {
        let state;
        if (this.idMap) {
            let key = this.idMap[id];
            if (key) state = key.state;
        }
        return state;
    }

    /**
     * isActiveKey(keyCode)
     *
     * @this {Input}
     * @param {number} keyCode
     * @return {number} index of keyCode in aKeysActive, or -1 if not found
     */
    isActiveKey(keyCode)
    {
        for (let i = 0; i < this.aKeysActive.length; i++) {
            if (this.aKeysActive[i].keyCode == keyCode) return i;
        }
        return -1;
    }

    /**
     * onKeyEvent(code, down, autoRelease)
     *
     * @this {Input}
     * @param {number} code (ie, keyCode if down is defined, charCode if undefined)
     * @param {boolean} [down] (true if keydown, false if keyup, undefined if keypress)
     * @param {boolean} [autoRelease]
     * @return {boolean} (true if processed, false if not)
     */
    onKeyEvent(code, down, autoRelease=false)
    {
        let keyCode, keyName;
        if (down != undefined) {
            keyCode = WebIO.FF_KEYCODE[code] || code;       // fix any Firefox-specific keyCodes
            keyName = WebIO.KEYNAME[code];
        } else {
            keyCode = 0;
            keyName = String.fromCharCode(code).toUpperCase();
        }
        if (this.gridMap) {
            if (down === false) return true;
            for (let row = 0; row < this.gridMap.length; row++) {
                let rowMap = this.gridMap[row];
                for (let col = 0; col < rowMap.length; col++) {
                    let aParts = rowMap[col].split('|');
                    if (aParts.indexOf(keyName) >= 0) {
                        if (this.keyState) {
                            if (this.keysPressed.length < 16) {
                                this.keysPressed.push(code);
                            }
                        } else {
                            this.keyState = 1;
                            this.keyActive = keyName;
                            this.setPosition(col, row);
                            this.checkKeyListeners(keyName, true);
                            this.advanceKeyState();
                        }
                        return true;
                    }
                }
            }
        }
        if (this.idMap) {
            if (down != undefined) {
                let ids = Object.keys(this.idMap);
                for (let i = 0; i < ids.length; i++) {
                    let id = ids[i];
                    if (this.idMap[id].keys.indexOf(keyName) >= 0) {
                        this.checkKeyListeners(id, down);
                        this.idMap[id].state = down? 1 : 0;
                        return true;
                    }
                }
            }
        }
        if (this.keyMap) {
            if (this.keyMap[keyCode]) {
                let i = this.isActiveKey(keyCode);
                if (down) {
                    if (i < 0) {
                        let msDown = Date.now();
                        this.aKeysActive.push({
                            keyCode, msDown, autoRelease
                        });
                    } else {
                        this.aKeysActive[i].msDown = Date.now();
                        this.aKeysActive[i].autoRelease = autoRelease;
                    }
                    if (autoRelease) this.checkAutoRelease();
                } else if (i >= 0) {
                    if (!this.aKeysActive[i].autoRelease) {
                        let msDown = this.aKeysActive[i].msDown;
                        if (msDown) {
                            let msElapsed = Date.now() - msDown;
                            if (msElapsed < Input.BUTTON_DELAY) {
                                this.aKeysActive[i].autoRelease = true;
                                this.checkAutoRelease();
                                return true;
                            }
                        }
                    }
                    this.aKeysActive.splice(i, 1);
                } else {
                    // this.println(softCode + " up with no down?");
                }
            }
        }
        return false;
    }

    /**
     * onKeyTimer()
     *
     * @this {Input}
     */
    onKeyTimer()
    {

        if (this.keyState == 1) {
            this.keyState++;
            this.checkKeyListeners(this.keyActive, false);
            this.keyActive = "";
            this.setPosition(-1, -1);
            this.advanceKeyState();
        } else {
            this.keyState = 0;
            if (this.keysPressed.length) {
                this.onKeyEvent(this.keysPressed.shift());
            }
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Input}
     */
    onReset()
    {
        /*
         * As keyDown events are encountered, the event keyCode is checked against the active keyMap, if any.
         * If the keyCode exists in the keyMap, then an entry for the key is added to the aKeysActive array.
         * When the key is finally released (or auto-released), its entry is removed from the array.
         */
        this.aKeysActive = [];

        /*
         * The current (assumed) physical (and simulated) states of the various shift/lock keys.
         *
         * TODO: Determine how (or whether) we can query the browser's initial shift/lock key states.
         */
        this.bitsState = 0;

        /*
         * Finally, the active input state.  If there is no active input, col and row are -1.  After
         * this point, these variables will be updated by setPosition().
         */
        this.col = this.row = -1;
    }

    /**
     * onSurfaceEvent(element, action, event)
     *
     * @this {Input}
     * @param {Element} element
     * @param {number} action
     * @param {Event|MouseEvent|TouchEvent} [event] (eg, the object from a 'touch' or 'mouse' event)
     */
    onSurfaceEvent(element, action, event)
    {
        let col = -1, row = -1;
        let fMultiTouch = false;
        let x, y, xInput, yInput, fButton, fInput, fPower;

        if (action < Input.ACTION.RELEASE) {

            /**
             * @name Event
             * @property {Array} targetTouches
             */
            event = event || window.event;

            if (!event.targetTouches || !event.targetTouches.length) {
                x = event.pageX;
                y = event.pageY;
            } else {
                x = event.targetTouches[0].pageX;
                y = event.targetTouches[0].pageY;
                fMultiTouch = (event.targetTouches.length > 1);
            }

            /*
             * Touch coordinates (that is, the pageX and pageY properties) are relative to the page, so to make
             * them relative to the element, we must subtract the element's left and top positions.  This Apple web page:
             *
             *      https://developer.apple.com/library/safari/documentation/AudioVideo/Conceptual/HTML-canvas-guide/AddingMouseandTouchControlstoCanvas/AddingMouseandTouchControlstoCanvas.html
             *
             * makes it sound simple, but it turns out we have to walk the element's entire "parentage" of DOM elements
             * to get the exact offsets.
             */
            let xOffset = 0;
            let yOffset = 0;
            let elementNext = element;
            do {
                if (!isNaN(elementNext.offsetLeft)) {
                    xOffset += elementNext.offsetLeft;
                    yOffset += elementNext.offsetTop;
                }
            } while ((elementNext = elementNext.offsetParent));

            /*
             * Due to the responsive nature of our pages, the displayed size of the surface image may be smaller than
             * the original size, and the coordinates we receive from events are based on the currently displayed size.
             */
            x = ((x - xOffset) * (this.cxSurface / element.offsetWidth))|0;
            y = ((y - yOffset) * (this.cySurface / element.offsetHeight))|0;

            xInput = x - this.xInput;
            yInput = y - this.yInput;

            /*
             * fInput is set if the event occurred somewhere within the input region (ie, the calculator keypad),
             * either on a button or between buttons, whereas fButton is set if the event occurred squarely (rectangularly?)
             * on a button.  fPower deals separately with the power button; it is set if the event occurred on the
             * power button.
             */
            fInput = fButton = false;
            fPower = (x >= this.xPower && x < this.xPower + this.cxPower && y >= this.yPower && y < this.yPower + this.cyPower);

            /*
             * I use the top of the input region, less some gap, to calculate a dividing line, above which
             * default actions should be allowed, and below which they should not.  Ditto for any event inside
             * the power button.
             */
            if (xInput >= 0 && xInput < this.cxInput && yInput + this.cyGap >= 0 || fPower) {
                /*
                 * If we allow touch events to be processed, they will generate mouse events as well, causing
                 * confusion and delays.  We can sidestep that problem by preventing default actions on any event
                 * that occurs within the input region.  One downside is that you can no longer scroll or zoom the
                 * image using touch, but that may be just as well, because you probably don't want sloppy touches
                 * moving your display around (or worse, a rapid double-tap zooming the display).  I do try to
                 * make one small concession for two-finger zoom operations (see fMultiTouch), but that's a bit
                 * fiddly, because it depends on both fingers hitting the surface at the same instant.
                 */
                if (!fMultiTouch && !this.fScroll) event.preventDefault();

                if (xInput >= 0 && xInput < this.cxInput && yInput >= 0 && yInput < this.cyInput) {
                    fInput = true;
                    /*
                     * The width and height of each column and row could be determined by computing cxGap + cxButton
                     * and cyGap + cyButton, respectively, but those gap and button sizes are merely estimates, and should
                     * only be used to help with the final button coordinate checks farther down.
                     */
                    let cxCol = (this.cxInput / this.nCols) | 0;
                    let cyCol = (this.cyInput / this.nRows) | 0;
                    let colInput = (xInput / cxCol) | 0;
                    let rowInput = (yInput / cyCol) | 0;

                    /*
                     * If the grid is hexagonal (aka "Lite-Brite" mode), then the cells of even-numbered rows are
                     * offset horizontally by 1/2 cell.  In addition, the last cell in those rows is unused, so if
                     * after compensating by 1/2 cell, the target column is the last cell, we set xInput to -1,
                     * effectively ignoring input on that cell.
                     */
                    if (this.fHexagonal && !(rowInput & 0x1)) {
                        xInput -= (cxCol >> 1);
                        colInput = (xInput / cxCol) | 0;
                        if (colInput == this.nCols - 1) xInput = -1;
                    }

                    /*
                     * (xCol,yCol) will be the top left corner of the button closest to the point of input.  However, that's
                     * based on our gap estimate.  If things seem "too tight", shrink the gap estimates, which will automatically
                     * increase the button size estimates.
                     */
                    let xCol = colInput * cxCol + (this.cxGap >> 1);
                    let yCol = rowInput * cyCol + (this.cyGap >> 1);

                    xInput -= xCol;
                    yInput -= yCol;
                    if (xInput >= 0 && xInput < this.cxButton && yInput >= 0 && yInput < this.cyButton) {
                        col = colInput;
                        row = rowInput;
                        fButton = true;
                    }
                }
            }
        }

        this.checkSurfaceListeners(action, xInput || 0, yInput || 0, element.offsetWidth, element.offsetHeight);

        if (fMultiTouch) return;

        if (action == Input.ACTION.PRESS) {
            /*
             * Record the position of the event, transitioning xStart and yStart to non-negative values.
             */
            this.xStart = x;
            this.yStart = y;
            if (fInput) {
                /*
                 * The event occurred in the input region, so we call setPosition() regardless of whether
                 * it hit or missed a button.
                 */
                this.setPosition(col, row);
                /*
                 * On the other hand, if it DID hit a button, then we arm the auto-release timer, to ensure
                 * a minimum amount of time (ie, BUTTON_DELAY).
                 */
                if (fButton && this.buttonDelay) {
                    this.time.setTimer(this.timerInputRelease, this.buttonDelay, true);
                }
            } else if (fPower) {
                this.machine.onPower();
            }
        }
        else if (action == Input.ACTION.MOVE) {
            if (this.xStart >= 0 && this.yStart >= 0 && this.fDrag) {
                this.setPosition(col, row);
            }
            else if (this.onHover) {
                this.onHover(col, row);
            }
        }
        else if (action == Input.ACTION.RELEASE) {
            /*
             * Don't immediately signal the release if the release timer is active (let the timer take care of it).
             */
            if (!this.buttonDelay || !this.time.isTimerSet(this.timerInputRelease)) {
                this.setPosition(-1, -1);
            }
            this.xStart = this.yStart = -1;
        }
        else {
            this.println("unrecognized action: " + action);
        }
    }

    /**
     * setFocus()
     *
     * If we have a focusable input element, give it focus.  This is used by the Debugger, for example, to switch focus
     * after starting the machine.
     *
     * @this {Input}
     */
    setFocus()
    {
        /*
         * In addition, we now check machine.ready, to avoid jerking the page's focus around when a machine is first
         * powered; it won't be marked ready until all the onPower() calls have completed, including the CPU's onPower()
         * call, which in turn calls setFocus().
         */
        if (this.focusElement && this.machine.ready) this.focusElement.focus();
    }

    /**
     * setPosition(col, row)
     *
     * @this {Input}
     * @param {number} col
     * @param {number} row
     */
    setPosition(col, row)
    {
        if (col != this.col || row != this.row) {
            this.col = col;
            this.row = row;
            if (this.onInput) this.onInput(col, row);
        }
    }
}

Input.ACTION = {
    PRESS:      1,              // eg, an action triggered by a 'mousedown' or 'touchstart' event
    MOVE:       2,              // eg, an action triggered by a 'mousemove' or 'touchmove' event
    RELEASE:    3               // eg, an action triggered by a 'mouseup' (or 'mouseout') or 'touchend' event
};

Input.BINDING = {
    POWER:      "power",
    RESET:      "reset",
    SURFACE:    "surface"
};

Input.TYPE = {
    IDMAP:      "idMap",
    SWITCH:     "switch"
};

Input.BUTTON_DELAY = 50;    // minimum number of milliseconds to ensure between button presses and releases

Defs.CLASSES["Input"] = Input;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/led.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), type: number, width: (number|undefined), height: (number|undefined), cols: (number|undefined), colsExtra: (number|undefined), rows: (number|undefined), rowsExtra: (number|undefined), color: (string|undefined), backgroundColor: (string|undefined), fixed: (boolean|undefined), hexagonal: (boolean|undefined), highlight: (boolean|undefined), persistent: (boolean|undefined) }} */
var LEDConfig;

/**
 * The ultimate goal is to provide support for a variety of LED types, such as:
 *
 * 1) LED Light (single light)
 * 2) LED Digit (7-segment digit)
 *
 * The initial goal is to manage a 12-element array of 7-segment LED digits for the TI-57.
 *
 * We create a "view" canvas element inside the specified "container" element, along with a "grid" canvas
 * where all the real drawing occurs; drawView() then renders the "grid" canvas onto the "view" canvas.
 *
 * Internally, our LED digits have a width and height of 96 and 128.  Those are "grid" dimensions which
 * cannot be changed, because our table of drawing coordinates in LED.SEGMENTS are hard-coded for those
 * dimensions.  The cell width and height that are specified as part of the LEDConfig are "view" dimensions,
 * which usually match the grid dimensions, but you're welcome to scale them up or down; the browser's
 * drawImage() function takes care of that.
 *
 * There is a low-level function, drawGridSegment(), for drawing specific LED segments of specific digits;
 * generally, you start with clearGrid(), draw all the segments for a given update, and then call drawView()
 * to make them visible.
 *
 * However, our devices operate at a higher level.  They use setLEDState() to modify the state,
 * character, etc, that each of the LED cells should display, which updates our internal LED buffer.  Then
 * at whatever display refresh rate is set (typically 60Hz), drawBuffer() is called to see if the buffer
 * contents have been modified since the last refresh, and if so, it converts the contents of the buffer to
 * a string and calls drawString().
 *
 * This buffering strategy, combined with the buffer "tickled" flag (see below), not only makes life
 * simple for this device, but also simulates how the display goes blank for short periods of time while
 * the CPU is busy performing calculations.
 *
 * @class {LED}
 * @unrestricted
 * @property {LEDConfig} config
 * @property {number} type (one of the LED.TYPE values)
 * @property {number} width (default is 96 for LED.TYPE.DIGIT, 32 otherwise; see LED.SIZES)
 * @property {number} height (default is 128 for LED.TYPE.DIGIT, 32 otherwise; see LED.SIZES)
 * @property {number} cols (default is 1)
 * @property {number} rows (default is 1)
 * @property {number} colsView (default is cols)
 * @property {number} rowsView (default is rows)
 * @property {string} color (default is none; ie, transparent foreground)
 * @property {string} colorBackground (default is none; ie, transparent background)
 * @property {boolean} fFixed (default is false, meaning the view may fill the container to its maximum size)
 * @property {boolean} fHexagonal (default is false)
 * @property {boolean} fHighlight (default is true)
 * @property {boolean} fPersistent (default is false for LED.TYPE.DIGIT, meaning the view will be blanked if not refreshed)
 * @property {number} widthView (computed)
 * @property {number} heightView (computed)
 * @property {number} widthGrid (computed)
 * @property {number} heightGrid (computed)
 * @property {HTMLCanvasElement} canvasView
 * @property {CanvasRenderingContext2D} contextView
 * @property {HTMLCanvasElement} canvasGrid
 * @property {CanvasRenderingContext2D} contextGrid
 * @property {{ container: Element|undefined }} bindings
 * @property {Array.<string|number|null>} buffer
 * @property {Array.<string|number>|null} bufferClone
 * @property {boolean} fBufferModified
 * @property {boolean} fBufferTickled
 */
class LED extends Device {
    /**
     * LED(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "display": {
     *        "class": "LED",
     *        "type": 3,
     *        "cols": 12,
     *        "rows": 1,
     *        "color": "red",
     *        "bindings": {
     *          "container": "displayTI57"
     *        }
     *      }
     *
     * @this {LED}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {LEDConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config, ["color", "backgroundColor"]);

        let container = this.bindings[LED.BINDING.CONTAINER];
        if (!container) {
            let sError = "LED binding for '" + LED.BINDING.CONTAINER + "' missing: '" + this.config.bindings[LED.BINDING.CONTAINER] + "'";
            throw new Error(sError);
        }

        let canvasView = /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
        if (!canvasView || !canvasView.getContext) {
            let sError = "LED device requires HTML5 canvas support";
            container.innerHTML = sError;
            throw new Error(sError);
        }

        this.container = container;
        this.canvasView = canvasView;

        this.type = this.getBounded(this.getDefaultNumber('type', LED.TYPE.ROUND, LED.TYPES), LED.TYPE.SMALL, LED.TYPE.DIGIT);
        this.widthCell = LED.SIZES[this.type][0];
        this.heightCell = LED.SIZES[this.type][1];
        this.width = this.getDefaultNumber('width', this.widthCell);
        this.height = this.getDefaultNumber('height', this.heightCell);
        this.colsView = this.getDefaultNumber('cols',  1);
        this.cols = this.colsView + this.getDefaultNumber('colsExtra', 0);
        this.rowsView = this.getDefaultNumber('rows',  1);
        this.rows = this.rowsView + this.getDefaultNumber('rowsExtra', 0);
        this.widthView = this.width * this.colsView;
        this.heightView = this.height * this.rowsView;

        this.colorTransparent = this.getRGBAColor("black", 0);
        this.colorOn = this.getRGBColor(this.config['color']) || this.colorTransparent;
        this.colorOff = this.getRGBAColor(this.colorOn, 1.0, 0.25);
        this.colorHighlight = this.getRGBAColor(this.colorOn, 1.0, 2.0);
        this.colorBackground = this.getRGBColor(this.config['backgroundColor']);

        /*
         * We generally want our view canvas to be "responsive", not "fixed" (ie, to automatically resize
         * with changes to the overall window size), so we apply the following style attributes:
         *
         *      width: 100%;
         *      height: auto;
         *
         * But, if you really don't want that feature, then set the LED config's "fixed" property to true.
         */
        this.fFixed = this.getDefaultBoolean('fixed', false);
        if (!this.fFixed) {
            canvasView.style.width = "100%";
            canvasView.style.height = "auto";
        }

        /*
         * Hexagonal (aka "Lite-Brite" mode) and highlighting options
         */
        this.fHexagonal = this.getDefaultBoolean('hexagonal', false);
        this.fHighlight = this.getDefaultBoolean('highlight', true);

        /*
         * Persistent LEDS are the default, except for LED.TYPE.DIGIT, which is used with calculator displays
         * whose underlying hardware must constantly "refresh" the LEDs to prevent them from going dark.
         */
        this.fPersistent = this.getDefaultBoolean('persistent', (this.type < LED.TYPE.DIGIT));

        canvasView.setAttribute("width", this.widthView.toString());
        canvasView.setAttribute("height", this.heightView.toString());
        canvasView.style.backgroundColor = this.colorTransparent;
        container.appendChild(canvasView);
        this.contextView = /** @type {CanvasRenderingContext2D} */ (canvasView.getContext("2d"));

        /*
         * canvasGrid is where all LED segments are composited; then they're drawn onto canvasView.
         */
        this.canvasGrid = /** @type {HTMLCanvasElement} */ (document.createElement("canvas"));
        if (this.canvasGrid) {
            this.canvasGrid.width = this.widthGrid = this.widthCell * this.colsView;
            this.canvasGrid.height = this.heightGrid = this.heightCell * this.rowsView;
            this.contextGrid = this.canvasGrid.getContext("2d");
        }

        /*
         * Time to allocate our internal LED buffer.  Other devices access the buffer through interfaces
         * like setLEDState() and getLEDState().  The LED buffer contains four per elements per LED cell:
         *
         *      [0]:    state (eg, ON or OFF or a digit)
         *      [1]:    color
         *      [2]:    count(s) (eg, 0 to 8  4-bit counts)
         *      [3]:    flags (eg, PERIOD, MODIFIED, etc)
         *
         * The LED buffer also contains an extra (scratch) row at the end.  This extra row, along with the
         * dynamically allocated "clone" buffer, is used by the LED Controller for direct buffer manipulation;
         * see the low-level getBuffer(), getBufferClone(), and swapBuffers() interfaces.
         */
        this.nBufferInc = 4;
        this.nBufferCells = ((this.rows + 1) * this.cols) * this.nBufferInc;
        this.buffer = new Array(this.nBufferCells);
        this.bufferClone = null;
        this.nBufferIncExtra = (this.colsView < this.cols? (this.cols - this.colsView) * 4 : 0);

        /*
         * fBufferModified is straightforward: set to true by any setLEDState() call that actually
         * changed something in the LED buffer, set to false after every drawBuffer() call, periodic
         * or otherwise.
         *
         * fBufferTickled is a flag which, under normal (idle) circumstances, will constantly be set
         * to true by periodic display operations that call setLEDState(); we clear it after every
         * periodic drawBuffer(), so if the machine fails to execute a setBuffer() in a timely manner,
         * we will see that fBufferTickled hasn't been "tickled", and automatically blank the display.
         *
         * fDisplayOn is a global "on/off" switch for the entire display.
         */
        this.fBufferModified = this.fBufferTickled = false;
        this.msLastDraw = 0;
        this.fDisplayOn = true;

        /*
         * nShiftedLeft is an optimization that tells drawGrid() when it can minimize the number of
         * individual cells to redraw, by shifting the entire grid image leftward and redrawing only
         * the rightmost cells.
         */
        this.nShiftedLeft = 0;

        /*
         * This records the location of the most recent LED buffer location updated via setLEDState(),
         * in case we want to highlight it.
         */
        this.iBufferRecent = -1;

        let led = this;
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.time.addAnimation(function ledAnimate(t) {
            led.drawBuffer(false, t);
        });

        led.clearBuffer(true);
    }

    /**
     * clearBuffer(fDraw)
     *
     * @this {LED}
     * @param {boolean} [fDraw]
     */
    clearBuffer(fDraw)
    {
        this.initBuffer(this.buffer);
        this.fBufferModified = this.fBufferTickled = true;
        if (fDraw) this.drawBuffer(true);
    }

    /**
     * clearGrid()
     *
     * @this {LED}
     */
    clearGrid()
    {
        if (this.colorBackground) {
            this.contextGrid.fillStyle = this.colorBackground;
            this.contextGrid.fillRect(0, 0, this.widthGrid, this.heightGrid);
        } else {
            this.contextGrid.clearRect(0, 0, this.widthGrid, this.heightGrid);
        }
    }

    /**
     * clearGridCell(col, row, xOffset)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {number} xOffset
     */
    clearGridCell(col, row, xOffset)
    {
        let xDst = col * this.widthCell + xOffset;
        let yDst = row * this.heightCell;
        if (this.colorBackground) {
            this.contextGrid.fillStyle = this.colorBackground;
            this.contextGrid.fillRect(xDst, yDst, this.widthCell, this.heightCell);
        } else {
            this.contextGrid.clearRect(xDst, yDst, this.widthCell, this.heightCell);
        }
    }

    /**
     * drawBuffer(fForced, t)
     *
     * This is our periodic (60Hz) redraw function; however, it can also be called synchronously
     * (eg, see clearBuffer()).  The other important periodic side-effect of this function is clearing
     * fBufferTickled, so that if no other setLEDState() calls occur between now and the next drawBuffer(),
     * an automatic clearBuffer() will be triggered.  This simulates the normal blanking of the display
     * whenever the machine performs lengthy calculations, because for an LED display to remain lit,
     * the machine must perform a display operation ("refresh") at least 30-60 times per second.
     *
     * @this {LED}
     * @param {boolean} [fForced] (if not set, this is a normal refresh call)
     * @param {number} [t] (time value, if available, from the requestAnimationFrame() callback)
     */
    drawBuffer(fForced = false, t = 0)
    {
        if (this.fBufferModified || fForced) {
            if (this.type < LED.TYPE.DIGIT) {
                this.drawGrid(fForced);
            } else {
                let s = "";
                for (let i = 0; i < this.buffer.length; i += this.nBufferInc) {
                    s += this.buffer[i] || ' ';
                    if (this.buffer[i+3] & LED.FLAGS.PERIOD) s += '.';
                }
                this.drawString(s);
            }
            this.fBufferModified = false;
            this.iBufferRecent = -1;
        }
        else if (!this.fPersistent && !this.fBufferTickled) {
            if (!t || !this.msLastDraw || (t - this.msLastDraw) >= ((1000 / 60)|0)) {
                this.clearBuffer(true);
            }
        }
        this.fBufferTickled = false;
        if (t) this.msLastDraw = t;
    }

    /**
     * drawGrid(fForced)
     *
     * Used by drawBuffer() for LED.TYPE.ROUND, LED.TYPE.SQUARE, etc.
     *
     * If the buffer was recently shifted left (ie, nShiftedLeft is set), then we take advantage
     * of that knowledge to use drawImage() to shift the entire grid image left, and then redrawing
     * only the rightmost visible column.
     *
     * @this {LED}
     * @param {boolean} [fForced] (if not set, this is a normal refresh call)
     */
    drawGrid(fForced)
    {
        let colRedraw = 0;
        if (!this.fPersistent || fForced) {
            this.clearGrid();
        } else if (this.nShiftedLeft) {
            colRedraw = this.colsView - this.nShiftedLeft;
            let xStart = this.widthCell * this.nShiftedLeft;
            let cxVisible = this.widthCell * colRedraw;
            this.contextGrid.drawImage(this.canvasGrid, xStart, 0, cxVisible, this.heightGrid, 0, 0, cxVisible, this.heightGrid);
            /*
             * At this point, the only grid drawing we might need to do now is the column at colRedraw,
             * but we still loop over the entire buffer to ensure all the cell MODIFIED states are in sync.
             */
        }
        let i = 0;
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.colsView; col++) {
                let state = this.buffer[i];
                let color = this.buffer[i+1] || this.colorTransparent;
                let fLeaveModified = false;
                let fModified = !!(this.buffer[i+3] & LED.FLAGS.MODIFIED);
                let fHighlight = (this.fHighlight && i == this.iBufferRecent);
                if (!this.fDisplayOn && state) {
                    state = LED.STATE.OFF;
                    fModified = fLeaveModified = true;
                }
                if (fModified || fHighlight || fForced) {
                    if (col >= colRedraw) {
                        this.drawGridCell(state, color, col, row, fHighlight);
                    }
                    if (fHighlight || fLeaveModified) {
                        this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                    } else {
                        this.buffer[i+3] &= ~LED.FLAGS.MODIFIED;
                    }
                }
                i += this.nBufferInc;
            }
            i += this.nBufferIncExtra;
        }
        this.nShiftedLeft = 0;
        this.drawView();
    }

    /**
     * drawGridCell(state, color, col, row, fHighlight)
     *
     * Used by drawGrid() for LED.TYPE.ROUND, LED.TYPE.SQUARE, etc.
     *
     * @this {LED}
     * @param {string} state (eg, LED.STATE.ON or LED.STATE.OFF)
     * @param {string} [color]
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     * @param {boolean} [fHighlight] (true if the cell should be highlighted; default is false)
     */
    drawGridCell(state, color, col = 0, row = 0, fHighlight = false)
    {
        let xOffset = 0;
        if (this.fHexagonal) {
            if (!(row & 0x1)) {
                xOffset = (this.widthCell >> 1);
                if (col == this.colsView - 1) return;
            }
        }

        let colorOn, colorOff;
        if (!color || color == this.colorOn) {
            colorOn = fHighlight? this.colorHighlight : this.colorOn;
            colorOff = this.colorOff;
        } else {
            colorOn = fHighlight? this.getRGBAColor(color, 1.0, 2.0) : color;
            colorOff = this.getRGBAColor(color, 1.0, 0.25);
        }

        let fTransparent = false;
        let colorCell = (state? colorOn : colorOff);
        if (colorOn == this.colorTransparent) {
            colorCell = this.colorBackground;
            fTransparent = true;
        }

        let xDst = col * this.widthCell + xOffset;
        let yDst = row * this.heightCell;

        /*
         * If this is NOT a persistent LED display, then drawGrid() will have done a preliminary clearGrid(),
         * eliminating the need to clear individual cells.  Whereas if this IS a persistent LED display, then
         * we need to clear cells on an as-drawn basis.  If we don't, there could be residual "bleed over"
         * around the edges of the shape we drew here previously.
         */
        if (this.fPersistent) {
            this.clearGridCell(col, row, xOffset);
        }

        this.contextGrid.fillStyle = colorCell;

        let coords = LED.SHAPES[this.type];
        if (coords.length == 3) {
            this.contextGrid.beginPath();
            this.contextGrid.arc(xDst + coords[0], yDst + coords[1], coords[2], 0, Math.PI * 2);
            if (fTransparent) {
                /*
                 * The following code works as well:
                 *
                 *      this.contextGrid.save();
                 *      this.contextGrid.clip();
                 *      this.contextGrid.clearRect(xDst, yDst, this.widthCell, this.heightCell);
                 *      this.contextGrid.restore();
                 *
                 * but I assume it's not as efficient.
                 */
                this.contextGrid.globalCompositeOperation = "destination-out";
                this.contextGrid.fill();
                this.contextGrid.globalCompositeOperation = "source-over";
            } else {
                this.contextGrid.fill();
            }
        } else {
            this.contextGrid.fillRect(xDst + coords[0], yDst + coords[1], coords[2], coords[3]);
        }
    }

    /**
     * drawGridSegment(seg, col, row)
     *
     * Used by drawSymbol() for LED.TYPE.DIGIT.
     *
     * @this {LED}
     * @param {string} seg (eg, "A")
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     */
    drawGridSegment(seg, col = 0, row = 0)
    {
        let coords = LED.SEGMENTS[seg];
        if (coords) {
            let xDst = col * this.widthCell;
            let yDst = row * this.heightCell;
            this.contextGrid.fillStyle = this.colorOn;
            this.contextGrid.beginPath();
            if (coords.length == 3) {
                this.contextGrid.arc(xDst + coords[0], yDst + coords[1], coords[2], 0, Math.PI * 2);
            } else {
                for (let i = 0; i < coords.length; i += 2) {
                    if (!i) {
                        this.contextGrid.moveTo(xDst + coords[i], yDst + coords[i+1]);
                    } else {
                        this.contextGrid.lineTo(xDst + coords[i], yDst + coords[i+1]);
                    }
                }
            }
            this.contextGrid.closePath();
            this.contextGrid.fill();
        }
    }

    /**
     * drawString(s)
     *
     * Used by drawBuffer() for LED.TYPE.DIGIT.
     *
     * @this {LED}
     * @param {string} s
     */
    drawString(s)
    {
        this.clearGrid();
        for (let i = 0, col = 0, row = 0; i < s.length; i++) {
            let ch = s[i];
            if (ch == '.') {
                if (col) col--;
            }
            this.drawSymbol(ch, col, row);
            if (++col == this.colsView) {
                col = 0;
                if (++row == this.rows) {
                    break;
                }
            }
        }
        this.drawView();
    }

    /**
     * drawSymbol(symbol, col, row)
     *
     * Used by drawString() for LED.TYPE.DIGIT.
     *
     * If the symbol does not exist in LED.SYMBOL_SEGMENTS, then nothing is drawn.
     *
     * @this {LED}
     * @param {string} symbol
     * @param {number} [col] (default is zero)
     * @param {number} [row] (default is zero)
     */
    drawSymbol(symbol, col = 0, row = 0)
    {
        let segments = LED.SYMBOL_SEGMENTS[symbol];
        if (segments) {
            for (let i = 0; i < segments.length; i++) {
                this.drawGridSegment(segments[i], col, row)
            }
        }
    }

    /**
     * drawView()
     *
     * @this {LED}
     */
    drawView()
    {
        /*
         * Setting the 'globalCompositeOperation' property of a 2D context is something you rarely need to do,
         * because the default draw behavior ("source-over") is fine for most cases.  One case where it is NOT
         * fine is when we're using a transparent background color, because it doesn't copy over any transparent
         * pixels, effectively making it impossible to "turn off" any previously drawn LED segments.  To force
         * that behavior, we must select the "copy" behavior.
         *
         * Refer to: https://www.w3.org/TR/2dcontext/#dom-context-2d-globalcompositeoperation
         */
        this.contextView.globalCompositeOperation = (this.colorBackground && this.colorOn != this.colorTransparent)? "source-over" : "copy";
        this.contextView.drawImage(this.canvasGrid, 0, 0, this.widthGrid, this.heightGrid, 0, 0, this.widthView, this.heightView);
    }

    /**
     * enableDisplay(on)
     *
     * @this {LED}
     * @param {boolean} [on]
     */
    enableDisplay(on = true)
    {
        if (this.fDisplayOn != on) {
            this.fDisplayOn = on;
            this.fBufferModified = true;
        }
    }

    /**
     * getBuffer()
     *
     * @this {LED}
     * @return {Array}
     */
    getBuffer()
    {
        return this.buffer;
    }

    /**
     * getBufferClone()
     *
     * @this {LED}
     * @return {Array}
     */
    getBufferClone()
    {
        if (!this.bufferClone) {
            this.bufferClone = new Array(this.nBufferCells);
            this.initBuffer(this.bufferClone);
        }
        return this.bufferClone;
    }

    /**
     * getLEDColor(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {string}
     */
    getLEDColor(col, row)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return this.buffer[i+1] || this.colorTransparent;
    }

    /**
     * getLEDColorValues(col, row, rgb)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} rgb
     * @return {boolean}
     */
    getLEDColorValues(col, row, rgb)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return this.parseRGBValues(this.buffer[i+1] || this.colorTransparent, rgb);
    }

    /**
     * getLEDCounts(col, row, counts)
     *
     * This function returns success (true) ONLY for cells that are not transparent.
     *
     * For a typical "Lite-Brite" grid, transparent cells are considered "empty", so we want to
     * ignore them.
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} counts
     * @return {boolean}
     */
    getLEDCounts(col, row, counts)
    {
        let fSuccess = false;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc && this.buffer[i+1]) {
            fSuccess = true;
            let bits = this.buffer[i+2];
            for (let c = counts.length - 1; c >= 0; c--) {
                counts[c] = bits & 0xf;
                bits >>>= 4;
            }
        }
        return fSuccess;
    }

    /**
     * getLEDCountsPacked(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {number}
     */
    getLEDCountsPacked(col, row)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        return (i <= this.buffer.length - this.nBufferInc)? this.buffer[i+2] : 0;
    }

    /**
     * getLEDState(col, row)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @return {number|undefined}
     */
    getLEDState(col, row)
    {
        let state;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            state = this.buffer[i];
        }
        return state;
    }

    /**
     * getDefaultColor()
     *
     * @this {LED}
     * @return {string}
     */
    getDefaultColor()
    {
        return this.colorOn;
    }

    /**
     * getRGBColor(color, colorDefault)
     *
     * Returns a color string in the "hex" format that fillStyle recognizes (eg, "#rrggbb").
     *
     * The default is optional, allowing an undefined color to remain undefined if we want to use
     * that to signal transparency (as in the case of colorBackground).
     *
     * @this {LED}
     * @param {string|undefined} color
     * @param {string} [colorDefault]
     * @return {string|undefined}
     */
    getRGBColor(color, colorDefault)
    {
        color = color || colorDefault;
        return color && LED.COLORS[color] || color;
    }

    /**
     * getRGBColorString(rgb)
     *
     * Returns a color string fillStyle recognizes (ie, "#rrggbb", or "rgba(r,g,b,a)" if an alpha value
     * less than 1 is set).
     *
     * TODO: Cache frequently requested colors.
     *
     * @this {LED}
     * @param {Array.<number>} rgb
     * @return {string}
     */
    getRGBColorString(rgb)
    {
        let s;
        if (rgb.length < 4 || rgb[3] == 1) {
            s = this.sprintf("#%02x%02x%02x", rgb[0], rgb[1], rgb[2]);
        } else {
            s = this.sprintf("rgba(%d,%d,%d,%d)", rgb[0], rgb[1], rgb[2], rgb[3]);
        }
        return s;
    }

    /**
     * getRGBAColor(color, alpha, brightness)
     *
     * Returns a color string in the "rgba" format that fillStyle recognizes (eg, "rgba(255, 255, 255, 0)").
     *
     * I used to use "alpha" to adjust the brightness, but it's safer to use the "brightness" parameter,
     * which simply scales all the RGB values.  That's because if any shapes are redrawn using a fillStyle
     * with alpha < 1.0, the target alpha values will be added instead of replaced, resulting in progressively
     * brighter shapes; probably not what you want.
     *
     * @this {LED}
     * @param {string} color
     * @param {number} [alpha]
     * @param {number} [brightness]
     * @return {string}
     */
    getRGBAColor(color, alpha = 1.0, brightness = 1.0)
    {
        if (color) {
            let rgb = [];
            color = LED.COLORS[color] || color;
            if (this.parseRGBValues(color, rgb)) {
                color = "rgba(";
                let i;
                for (i = 0; i < 3; i++) {
                    let n = Math.round(rgb[i] * brightness);
                    n = (n < 0? 0 : (n > 255? 255 : n));
                    color += n + ",";
                }
                color += (i < rgb.length? rgb[i] : alpha) + ")";
            }
        }
        return color;
    }

    /**
     * initBuffer(buffer)
     *
     * @this {LED}
     * @param {Array.<number|string|null>} buffer
     */
    initBuffer(buffer)
    {
        for (let i = 0; i < buffer.length; i += this.nBufferInc) {
            this.initCell(buffer, i);
        }
    }

    /**
     * initCell(buffer, iCell)
     *
     * @this {LED}
     * @param {Array.<number|string|null>} buffer
     * @param {number} iCell
     */
    initCell(buffer, iCell)
    {
        if (this.type < LED.TYPE.DIGIT) {
            buffer[iCell] = LED.STATE.OFF;
        } else {
            buffer[iCell] = ' ';
        }
        buffer[iCell+1] = (this.colorOn == this.colorTransparent? null : this.colorOn);
        buffer[iCell+2] = 0;
        buffer[iCell+3] = LED.FLAGS.MODIFIED;
    }

    /**
     * loadState(state)
     *
     * If any saved values don't match (possibly overridden), abandon the given state and return false.
     *
     * @this {LED}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let colorOn = state.shift();
        let colorBackground = state.shift();
        let buffer = state.shift();
        if (colorOn == this.colorOn && colorBackground == this.colorBackground && buffer && buffer.length == this.buffer.length) {
            this.buffer = buffer;
            /*
             * Loop over all the buffer colors to fix a legacy problem (ie, before we started storing null for colorTransparent)
             */
            for (let i = 0; i <= this.buffer.length - this.nBufferInc; i += this.nBufferInc) {
                if (this.buffer[i+1] == this.colorTransparent) this.buffer[i+1] = null;
            }
            this.drawBuffer(true);
            return true;
        }
        return false;
    }

    /**
     * parseRGBValues(color, rgb)
     *
     * @this {LED}
     * @param {string} color
     * @param {Array.<number>} rgb
     * @return {boolean}
     */
    parseRGBValues(color, rgb)
    {
        let base = 16;
        let match = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!match) {
            base = 10;
            match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*(\d+|)\)$/i);
        }
        if (match) {
            let i;
            for (i = 1; i < match.length; i++) {
                rgb[i-1] = Number.parseInt(match[i], base);
            }
            rgb.length = i-1;
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * @this {LED}
     * @param {Array} state
     */
    saveState(state)
    {
        if (this.buffer) {
            state.push(this.colorOn);
            state.push(this.colorBackground);
            state.push(this.buffer);
        }
    }

    /**
     * setContainerStyle(sAttr, sValue)
     *
     * @this {LED}
     * @param {string} sAttr
     * @param {string} sValue
     */
    setContainerStyle(sAttr, sValue)
    {
        if (this.container) this.container.style[sAttr] = sValue;
    }

    /**
     * setLEDColor(col, row, color)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {string} [color]
     * @return {boolean|null} (true if this call modified the LED color, false if not, null if error)
     */
    setLEDColor(col, row, color)
    {
        let fModified = null;
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            fModified = false;
            let colorNew = color || this.colorOn;
            if (colorNew == this.colorTransparent) colorNew = null;
            let i = (row * this.cols + col) * this.nBufferInc;
            if (this.buffer[i+1] !== colorNew) {
                this.buffer[i+1] = colorNew;
                if (!colorNew) this.buffer[i] = LED.STATE.OFF;  // transparent LEDs are automatically turned off
                this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
        }
        return fModified;
    }

    /**
     * setLEDCounts(col, row, counts)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {Array.<number>} counts
     * @return {boolean|null} (true if this call modified the LED color, false if not, null if error)
     */
    setLEDCounts(col, row, counts)
    {
        let fModified = null;
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            fModified = false;
            let i = (row * this.cols + col) * this.nBufferInc;
            let bits = 0;
            if (this.buffer[i+1]) {                             // only non-transparent LEDs are allowed to set counters
                for (let c = 0; c < counts.length; c++) {
                    bits = (bits << 4) | (counts[c] & 0xf);
                }
            }
            if (this.buffer[i+2] !== bits) {
                this.buffer[i+2] = bits;
                this.buffer[i+3] |= LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
        }
        return fModified;
    }

    /**
     * setLEDCountsPacked(col, row, counts)
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {number} counts
     * @return {boolean|null} (true if this call modified the LED state, false if not, null if error)
     */
    setLEDCountsPacked(col, row, counts)
    {
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            if (this.buffer[i+2] != counts) {
                this.buffer[i+2] = counts;
                return true;
            }
            return false;
        }
        return null;
    }

    /**
     * setLEDState(col, row, state, flags)
     *
     * For LED.TYPE.ROUND or LED.TYPE.SQUARE, the state parameter should be LED.STATE.OFF or LED.STATE.ON.
     *
     * @this {LED}
     * @param {number} col
     * @param {number} row
     * @param {string|number} state (new state for the specified cell)
     * @param {number} [flags]
     * @return {boolean} (true if this call modified the LED state, false if not)
     */
    setLEDState(col, row, state, flags = 0)
    {
        let fModified = false;
        let flagsSet = flags & LED.FLAGS.SET;
        let i = (row * this.cols + col) * this.nBufferInc;
        if (i <= this.buffer.length - this.nBufferInc) {
            if (this.buffer[i] !== state || (this.buffer[i+3] & LED.FLAGS.SET) !== flagsSet) {
                this.buffer[i] = state;
                this.buffer[i+3] = (this.buffer[i+3] & ~LED.FLAGS.SET) | flagsSet | LED.FLAGS.MODIFIED;
                this.fBufferModified = fModified = true;
            }
            this.iBufferRecent = i;
            this.fBufferTickled = true;
            this.nShiftedLeft = 0;
        }
        return fModified;
    }

    /**
     * swapBuffers()
     *
     * @this {LED}
     */
    swapBuffers()
    {
        let buffer = this.buffer;
        this.buffer = this.bufferClone;
        this.bufferClone = buffer;
        this.fBufferModified = true;
    }
}

LED.TYPE = {
    SMALL:      0,      // a smaller, more efficient (round) LED for large grids
    ROUND:      1,      // a single (round) LED
    SQUARE:     2,      // a single (square) LED
    DIGIT:      3       // a 7-segment (digit) LED, with optional period as an 8th segment
};

LED.TYPES = {
    "small":    LED.TYPE.SMALL,
    "round":    LED.TYPE.ROUND,
    "square":   LED.TYPE.SQUARE,
    "digit":    LED.TYPE.DIGIT
};

LED.BINDING = {
    CONTAINER:  "container"
};

LED.COLORS = {
    "aliceblue":            "#f0f8ff",
    "antiquewhite":         "#faebd7",
    "aqua":                 "#00ffff",
    "aquamarine":           "#7fffd4",
    "azure":                "#f0ffff",
    "beige":                "#f5f5dc",
    "bisque":               "#ffe4c4",
    "black":                "#000000",
    "blanchedalmond":       "#ffebcd",
    "blue":                 "#0000ff",
    "blueviolet":           "#8a2be2",
    "brown":                "#a52a2a",
    "burlywood":            "#deb887",
    "cadetblue":            "#5f9ea0",
    "chartreuse":           "#7fff00",
    "chocolate":            "#d2691e",
    "coral":                "#ff7f50",
    "cornflowerblue":       "#6495ed",
    "cornsilk":             "#fff8dc",
    "crimson":              "#dc143c",
    "cyan":                 "#00ffff",
    "darkblue":             "#00008b",
    "darkcyan":             "#008b8b",
    "darkgoldenrod":        "#b8860b",
    "darkgray":             "#a9a9a9",
    "darkgreen":            "#006400",
    "darkkhaki":            "#bdb76b",
    "darkmagenta":          "#8b008b",
    "darkolivegreen":       "#556b2f",
    "darkorange":           "#ff8c00",
    "darkorchid":           "#9932cc",
    "darkred":              "#8b0000",
    "darksalmon":           "#e9967a",
    "darkseagreen":         "#8fbc8f",
    "darkslateblue":        "#483d8b",
    "darkslategray":        "#2f4f4f",
    "darkturquoise":        "#00ced1",
    "darkviolet":           "#9400d3",
    "deeppink":             "#ff1493",
    "deepskyblue":          "#00bfff",
    "dimgray":              "#696969",
    "dodgerblue":           "#1e90ff",
    "firebrick":            "#b22222",
    "floralwhite":          "#fffaf0",
    "forestgreen":          "#228b22",
    "fuchsia":              "#ff00ff",
    "gainsboro":            "#dcdcdc",
    "ghostwhite":           "#f8f8ff",
    "gold":                 "#ffd700",
    "goldenrod":            "#daa520",
    "gray":                 "#808080",
    "green":                "#008000",
    "greenyellow":          "#adff2f",
    "honeydew":             "#f0fff0",
    "hotpink":              "#ff69b4",
    "indianred ":           "#cd5c5c",
    "indigo":               "#4b0082",
    "ivory":                "#fffff0",
    "khaki":                "#f0e68c",
    "lavender":             "#e6e6fa",
    "lavenderblush":        "#fff0f5",
    "lawngreen":            "#7cfc00",
    "lemonchiffon":         "#fffacd",
    "lightblue":            "#add8e6",
    "lightcoral":           "#f08080",
    "lightcyan":            "#e0ffff",
    "lightgoldenrodyellow": "#fafad2",
    "lightgrey":            "#d3d3d3",
    "lightgreen":           "#90ee90",
    "lightpink":            "#ffb6c1",
    "lightsalmon":          "#ffa07a",
    "lightseagreen":        "#20b2aa",
    "lightskyblue":         "#87cefa",
    "lightslategray":       "#778899",
    "lightsteelblue":       "#b0c4de",
    "lightyellow":          "#ffffe0",
    "lime":                 "#00ff00",
    "limegreen":            "#32cd32",
    "linen":                "#faf0e6",
    "magenta":              "#ff00ff",
    "maroon":               "#800000",
    "mediumaquamarine":     "#66cdaa",
    "mediumblue":           "#0000cd",
    "mediumorchid":         "#ba55d3",
    "mediumpurple":         "#9370d8",
    "mediumseagreen":       "#3cb371",
    "mediumslateblue":      "#7b68ee",
    "mediumspringgreen":    "#00fa9a",
    "mediumturquoise":      "#48d1cc",
    "mediumvioletred":      "#c71585",
    "midnightblue":         "#191970",
    "mintcream":            "#f5fffa",
    "mistyrose":            "#ffe4e1",
    "moccasin":             "#ffe4b5",
    "navajowhite":          "#ffdead",
    "navy":                 "#000080",
    "oldlace":              "#fdf5e6",
    "olive":                "#808000",
    "olivedrab":            "#6b8e23",
    "orange":               "#ffa500",
    "orangered":            "#ff4500",
    "orchid":               "#da70d6",
    "palegoldenrod":        "#eee8aa",
    "palegreen":            "#98fb98",
    "paleturquoise":        "#afeeee",
    "palevioletred":        "#d87093",
    "papayawhip":           "#ffefd5",
    "peachpuff":            "#ffdab9",
    "peru":                 "#cd853f",
    "pink":                 "#ffc0cb",
    "plum":                 "#dda0dd",
    "powderblue":           "#b0e0e6",
    "purple":               "#800080",
    "rebeccapurple":        "#663399",
    "red":                  "#ff0000",
    "rosybrown":            "#bc8f8f",
    "royalblue":            "#4169e1",
    "saddlebrown":          "#8b4513",
    "salmon":               "#fa8072",
    "sandybrown":           "#f4a460",
    "seagreen":             "#2e8b57",
    "seashell":             "#fff5ee",
    "sienna":               "#a0522d",
    "silver":               "#c0c0c0",
    "skyblue":              "#87ceeb",
    "slateblue":            "#6a5acd",
    "slategray":            "#708090",
    "snow":                 "#fffafa",
    "springgreen":          "#00ff7f",
    "steelblue":            "#4682b4",
    "tan":                  "#d2b48c",
    "teal":                 "#008080",
    "thistle":              "#d8bfd8",
    "tomato":               "#ff6347",
    "turquoise":            "#40e0d0",
    "violet":               "#ee82ee",
    "wheat":                "#f5deb3",
    "white":                "#ffffff",
    "whitesmoke":           "#f5f5f5",
    "yellow":               "#ffff00",
    "yellowgreen":          "#9acd32"
};

LED.STATE = {
    OFF:        0,
    ON:         1
};

/*
 * NOTE: Although technically the MODIFIED flag is an internal flag, it may be set explicitly as well;
 * the ROM device uses the setLEDState() flags parameter to set it, in order to trigger highlighting of
 * the most recently active LED.
 */
LED.FLAGS = {
    NONE:       0x00,
    SET:        0x81,   // bits that may be set using the flags parameter of setLEDState()
    PERIOD:     0x01,   // used with DIGIT-type LED to indicate that the period "segment" should be on, too
    MODIFIED:   0x80,   // cell has been modified since the last time it was drawn
};

LED.SHAPES = {
    [LED.TYPE.SMALL]:   [4, 4, 4],
    [LED.TYPE.ROUND]:   [16, 16, 14],
    [LED.TYPE.SQUARE]:  [2, 2, 28, 28]
};

LED.SIZES = [
    [8,   8],           // LED.TYPE.SMALL
    [32,  32],          // LED.TYPE.ROUND
    [32,  32],          // LED.TYPE.SQUARE
    [96, 128]           // LED.TYPE.DIGIT
];

/*
 * The segments are arranged roughly as follows, in a 96x128 grid:
 *
 *      AAAA
 *     F    B
 *     F    B
 *      GGGG
 *     E    C
 *     E    C
 *      DDDD P
 *
 * The following arrays specify pairs of moveTo()/lineTo() coordinates, used by drawGridSegment().  They all
 * assume the hard-coded width and height in LED.SIZES[LED.TYPE.DIGIT] specified above.  If there is a triplet
 * instead of one or more pairs (eg, the 'P' or period segment), then the coordinates are treated as arc()
 * parameters.
 */
LED.SEGMENTS = {
    'A':        [30,   8,  79,   8,  67,  19,  37,  19],
    'B':        [83,  10,  77,  52,  67,  46,  70,  22],
    'C':        [77,  59,  71, 100,  61,  89,  64,  64],
    'D':        [28,  91,  58,  91,  69, 104,  15, 104],
    'E':        [18,  59,  28,  64,  25,  88,  12, 100],
    'F':        [24,  10,  34,  21,  31,  47,  18,  52],
    'G':        [24,  56,  34,  50,  60,  50,  71,  56,  61,  61,  33,  61],
    'P':        [80, 102,  8]
};

/*
 * Segmented symbols are formed with the following segments.
 */
LED.SYMBOL_SEGMENTS = {
    ' ':        [],
    '0':        ['A','B','C','D','E','F'],
    '1':        ['B','C'],
    '2':        ['A','B','D','E','G'],
    '3':        ['A','B','C','D','G'],
    '4':        ['B','C','F','G'],
    '5':        ['A','C','D','F','G'],
    '6':        ['A','C','D','E','F','G'],
    '7':        ['A','B','C'],
    '8':        ['A','B','C','D','E','F','G'],
    '9':        ['A','B','C','D','F','G'],
    'A':        ['A','B','C','E','F','G'],
    'B':        ['C','D','E','F','G'],      // NOTE: this shape is a lower-case 'b', to make 'B' must be distinguishable from '8'
    'C':        ['A','D','E','F'],
    'D':        ['B','C','D','E','G'],      // NOTE: this shape is a lower-case 'd', to make 'D' must be distinguishable from '0'
    'E':        ['A','D','E','F','G'],
    'F':        ['A','E','F','G'],
    '-':        ['G'],
    '.':        ['P']
};

Defs.CLASSES["LED"] = LED;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/monitor.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ monitorWidth: number, monitorHeight: number }} */
var MonitorConfig;

/**
 * @class {Monitor}
 * @unrestricted
 * @property {MonitorConfig} config
 */
class Monitor extends Device {
    /**
     * Monitor(idMachine, idDevice, config)
     *
     * The Monitor component manages the container representing the machine's display device.  The most
     * important config properties include:
     *
     *      monitorWidth: width of the monitor canvas, in pixels
     *      monitorHeight: height of the monitor canvas, in pixels
     *      monitorColor: background color of the monitor canvas (default is black)
     *      monitorRotate: the amount of counter-clockwise monitor rotation required (eg, -90 or 270)
     *      aspectRatio (eg, 1.33)
     *
     * NOTE: I originally wanted to call this the Screen device, but alas, the browser world has co-opted that
     * name, so I had to settle for Monitor instead (I had also considered Display, but that seemed too generic).
     *
     * Monitor is probably a better choice anyway, because that allows us to clearly differentiate between the
     * "host display" (which involves the browser's page, document, window, or screen, depending on the context)
     * and the "guest display", which I now try to consistently refer to as the Monitor.
     *
     * There are still terms of art that can muddy the waters; for example, many video devices support the concept
     * of "off-screen memory", and sure, I could call that "off-monitor memory", but let's not get carried away.
     *
     * @this {Monitor}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {ROMConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        let monitor = this, sProp, sEvent;
        this.fStyleCanvasFullScreen = document.fullscreenEnabled || this.isUserAgent("Edge/");

        this.cxMonitor = config['monitorWidth'] || 640;
        this.cyMonitor = config['monitorHeight'] || 480;

        let container = this.bindings[Monitor.BINDING.CONTAINER];
        if (container) {
            /*
             * Making sure the container had a "tabindex" attribute seemed like a nice way of ensuring we
             * had a single focusable surface that we could pass to our Input device, but that would be too
             * simple.  Safari once again bites us in the butt, just like it did when we tried to add the
             * "contenteditable" attribute to the canvas: painting slows to a crawl.
             *
             *      container.setAttribute("tabindex", "0");
             */
            this.container = container;
        } else {
            throw new Error("unable to find monitor container: " + Monitor.BINDING.CONTAINER);
        }

        /*
         * Create the Monitor canvas if we weren't given a predefined canvas; we'll assume that an existing
         * canvas is already contained within the container.
         */
        let canvas = this.bindings[Monitor.BINDING.CANVAS];
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.setAttribute("class", "pcjsMonitor");
            canvas.setAttribute("width", config['monitorWidth']);
            canvas.setAttribute("height", config['monitorHeight']);
            canvas.style.backgroundColor = config['monitorColor'] || "black";
            container.appendChild(canvas);
        }
        this.canvasMonitor = canvas;

        /*
         * The "contenteditable" attribute on a canvas is a simple way of creating a display surface that can
         * also receive focus and generate input events.  Unfortunately, in Safari, that attribute NOTICEABLY
         * slows down canvas operations whenever it has focus.  All you have to do is click away from the canvas,
         * and drawing speeds up, then click back on the canvas, and drawing slows down.  So we now rely on a
         * "transparent textarea" solution (see below).
         *
         *      canvas.setAttribute("contenteditable", "true");
         */

        let context = canvas.getContext("2d");
        this.contextMonitor = context;

        /*
         * HACK: A canvas style of "auto" provides for excellent responsive canvas scaling in EVERY browser
         * except IE9/IE10, so I recalculate the appropriate CSS height every time the parent div is resized;
         * IE11 works without this hack, so we take advantage of the fact that IE11 doesn't identify as "MSIE".
         *
         * The other reason it's good to keep this particular hack limited to IE9/IE10 is that most other
         * browsers don't actually support an 'onresize' handler on anything but the window object.
         */
        if (this.isUserAgent("MSIE")) {
            container.onresize = function(parentElement, childElement, cx, cy) {
                return function onResizeScreen() {
                    childElement.style.height = (((parentElement.clientWidth * cy) / cx) | 0) + "px";
                };
            }(container, canvas, config['monitorWidth'], config['monitorHeight']);
            container.onresize();
        }

        /*
         * The following is a related hack that allows the user to force the monitor to use a particular aspect
         * ratio if an 'aspect' attribute or URL parameter is set.  Initially, it's just for testing purposes
         * until we figure out a better UI.  And note that we use our onPageEvent() helper function to make sure
         * we don't trample any other 'onresize' handler(s) attached to the window object.
         */
        let aspect = +(config['aspect'] || this.getURLParms()['aspect']);

        /*
         * No 'aspect' parameter yields NaN, which is falsey, and anything else must satisfy my arbitrary
         * constraints of 0.3 <= aspect <= 3.33, to prevent any useless (or worse, browser-blowing) results.
         */
        if (aspect && aspect >= 0.3 && aspect <= 3.33) {
            this.onPageEvent('onresize', function(parentElement, childElement, aspectRatio) {
                return function onResizeWindow() {
                    /*
                     * Since aspectRatio is the target width/height, we have:
                     *
                     *      parentElement.clientWidth / childElement.style.height = aspectRatio
                     *
                     * which means that:
                     *
                     *      childElement.style.height = parentElement.clientWidth / aspectRatio
                     *
                     * so for example, if aspectRatio is 16:9, or 1.78, and clientWidth = 640,
                     * then the calculated height should approximately 360.
                     */
                    childElement.style.height = ((parentElement.clientWidth / aspectRatio)|0) + "px";
                };
            }(container, canvas, aspect));
            window['onresize']();
        }

        /*
         * The 'touchtype' config property can be set to true for machines that require a full keyboard.  If
         * set, we create a transparent textarea on top of the canvas and provide it to the Input device via
         * addSurface(), making it easy for the user to activate the on-screen keyboard for touch-type devices.
         *
         * The parent div must have a style of "position:relative", so that we can position the textarea using
         * "position:absolute" with "top" and "left" coordinates of zero.  And we don't want the textarea to be
         * visible, but we must use "opacity:0" instead of "visibility:hidden", because the latter seems to
         * prevent the element from receiving events.
         *
         * All these styling requirements are resolved by using CSS class "pcjsMonitor" for the parent div and
         * CSS class "pcjsOverlay" for the textarea.
         *
         * Having the textarea can serve other useful purposes as well, such as providing a place for us to echo
         * diagnostic messages, and it solves the Safari performance problem I observed (see above).  Unfortunately,
         * it creates new challenges, too.  For example, textareas can cause certain key combinations, like "Alt-E",
         * to be withheld as part of the browser's support for multi-key character composition.  So I may have to
         * alter which element on the page gets focus depending on the platform or other factors.
         */
        let textarea;
        if (this.config['touchtype']) {
            textarea = document.createElement("textarea");
            textarea.setAttribute("class", "pcjsOverlay");
            /*
            * The soft keyboard on an iOS device tends to pop up with the SHIFT key depressed, which is not the
            * initial keyboard state we prefer, so hopefully turning off these "auto" attributes will help.
            */
            if (this.isUserAgent("iOS")) {
                textarea.setAttribute("autocorrect", "off");
                textarea.setAttribute("autocapitalize", "off");
                /*
                * One of the problems on iOS devices is that after a soft-key control is clicked, we need to give
                * focus back to the above textarea, usually by calling cmp.updateFocus(), but in doing so, iOS may
                * also "zoom" the page rather jarringly.  While it's a simple matter to completely disable zooming,
                * by fiddling with the page's viewport, that prevents the user from intentionally zooming.  A bit of
                * Googling reveals that another way to prevent those jarring unintentional zooms is to simply set the
                * font-size of the text control to 16px.  So that's what we do.
                */
                textarea.style.fontSize = "16px";
            }
            container.appendChild(textarea);
        }

        /*
         * If we have an associated input device, make sure it is associated with our default input surface.
         */
        this.input = /** @type {Input} */ (this.findDeviceByClass("Input", false));
        if (this.input) {
            this.inputMonitor = textarea || container;
            this.input.addSurface(this.inputMonitor, this.findBinding(Machine.BINDING.POWER, true));
        }

        /*
         * These variables are here in case we want/need to add support for borders later...
         */
        this.xMonitorOffset = this.yMonitorOffset = 0;
        this.cxMonitorOffset = this.cxMonitor;
        this.cyMonitorOffset = this.cyMonitor;

        /*
         * Support for disabling (or, less commonly, enabling) image smoothing, which all browsers
         * seem to support now (well, OK, I still have to test the latest MS Edge browser), despite
         * it still being labelled "experimental technology".  Let's hope the browsers standardize
         * on this.  I see other options emerging, like the CSS property "image-rendering: pixelated"
         * that's apparently been added to Chrome.  Sigh.
         */
        let fSmoothing = config['smoothing'];
        let sSmoothing = this.getURLParms()['smoothing'];
        if (sSmoothing) fSmoothing = (sSmoothing == "true");
        this.fSmoothing = fSmoothing;
        this.sSmoothing = this.findProperty(context, 'imageSmoothingEnabled');

        this.rotateMonitor = config['monitorRotate'];
        if (this.rotateMonitor) {
            this.rotateMonitor = this.rotateMonitor % 360;
            if (this.rotateMonitor > 0) this.rotateMonitor -= 360;
            /*
             * TODO: Consider also disallowing any rotateMonitor value if bufferRotate was already set; setting
             * both is most likely a mistake, but who knows, maybe someone wants to use both for 180-degree rotation?
             */
            if (this.rotateMonitor != -90) {
                this.printf("unsupported monitor rotation: %d\n", this.rotateMonitor);
                this.rotateMonitor = 0;
            } else {
                context.translate(0, this.cyMonitor);
                context.rotate((this.rotateMonitor * Math.PI)/180);
                context.scale(this.cyMonitor/this.cxMonitor, this.cxMonitor/this.cyMonitor);
            }
        }

        /*
         * Here's the gross code to handle full-screen support across all supported browsers.  Most of the crud is
         * now buried inside findProperty(), which checks for all the browser prefix variations (eg, "moz", "webkit")
         * and deals with certain property name variations, like 'Fullscreen' (new) vs 'FullScreen' (old).
         */
        let button = this.bindings[Monitor.BINDING.FULLSCREEN];
        if (button) {
            sProp = this.findProperty(container, 'requestFullscreen');
            if (sProp) {
                container.doFullScreen = container[sProp];
                sEvent = this.findProperty(document, 'on', 'fullscreenchange');
                if (sEvent) {
                    let sFullScreen = this.findProperty(document, 'fullscreenElement');
                    document.addEventListener(sEvent, function onFullScreenChange() {
                        monitor.onFullScreen(document[sFullScreen] != null);
                    }, false);
                }
                sEvent = this.findProperty(document, 'on', 'fullscreenerror');
                if (sEvent) {
                    document.addEventListener(sEvent, function onFullScreenError() {
                        monitor.onFullScreen();
                    }, false);
                }
            } else {
                this.printf("Full-screen API not available\n");
                button.parentNode.removeChild(/** @type {Node} */ (button));
            }
        }
    }

    /**
     * addBinding(binding, element)
     *
     * @this {Monitor}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let monitor = this;

        switch(binding) {
        case Monitor.BINDING.FULLSCREEN:
            element.onclick = function onClickFullScreen() {
                if (DEBUG) monitor.printf(MESSAGE.SCREEN, "onClickFullScreen()\n");
                monitor.doFullScreen();
            };
            break;
        }
        super.addBinding(binding, element);
    }

    /**
     * blankMonitor()
     *
     * @this {Monitor}
     */
    blankMonitor()
    {
        if (this.contextMonitor) {
            this.contextMonitor.fillStyle = "black";
            this.contextMonitor.fillRect(0, 0, this.canvasMonitor.width, this.canvasMonitor.height);
        }
    }

    /**
     * doFullScreen()
     *
     * @this {Monitor}
     * @return {boolean} true if request successful, false if not (eg, failed OR not supported)
     */
    doFullScreen()
    {
        let fSuccess = false;
        if (this.container) {
            if (this.container.doFullScreen) {
                /*
                 * Styling the container with a width of "100%" and a height of "auto" works great when the aspect ratio
                 * of our virtual monitor is at least roughly equivalent to the physical screen's aspect ratio, but now that
                 * we support virtual VGA monitors with an aspect ratio of 1.33, that's very much out of step with modern
                 * wide-screen monitors, which usually have an aspect ratio of 1.6 or greater.
                 *
                 * And unfortunately, none of the browsers I've tested appear to make any attempt to scale our container to
                 * the physical screen's dimensions, so the bottom of our monitor gets clipped.  To prevent that, I reduce
                 * the width from 100% to whatever percentage will accommodate the entire height of the virtual monitor.
                 *
                 * NOTE: Mozilla recommends both a width and a height of "100%", but all my tests suggest that using "auto"
                 * for height works equally well, so I'm sticking with it, because "auto" is also consistent with how I've
                 * implemented a responsive canvas when the browser window is being resized.
                 */
                let sWidth = "100%";
                let sHeight = "auto";
                if (screen && screen.width && screen.height) {
                    let aspectPhys = screen.width / screen.height;
                    let aspectVirt = this.cxMonitor / this.cyMonitor;
                    if (aspectPhys > aspectVirt) {
                        sWidth = Math.round(aspectVirt / aspectPhys * 100) + '%';
                    }
                    // TODO: We may need to someday consider the case of a physical screen with an aspect ratio < 1.0....
                }
                if (!this.fStyleCanvasFullScreen) {
                    this.container.style.width = sWidth;
                    this.container.style.height = sHeight;
                } else {
                    /*
                     * Sadly, the above code doesn't work for Firefox (nor for Chrome, as of Chrome 75 or so), because as
                     * http://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/Using_full_screen_mode explains:
                     *
                     *      'It's worth noting a key difference here between the Gecko and WebKit implementations at this time:
                     *      Gecko automatically adds CSS rules to the element to stretch it to fill the screen: "width: 100%; height: 100%".
                     *
                     * Which would be OK if Gecko did that BEFORE we're called, but apparently it does that AFTER, effectively
                     * overwriting our careful calculations.  So we style the inner element (canvasMonitor) instead, which
                     * requires even more work to ensure that the canvas is properly centered.  FYI, this solution is consistent
                     * with Mozilla's recommendation for working around their automatic CSS rules:
                     *
                     *      '[I]f you're trying to emulate WebKit's behavior on Gecko, you need to place the element you want
                     *      to present inside another element, which you'll make fullscreen instead, and use CSS rules to adjust
                     *      the inner element to match the appearance you want.'
                     */
                    this.canvasMonitor.style.width = sWidth;
                    this.canvasMonitor.style.height = sHeight;
                    this.canvasMonitor.style.display = "block";
                    this.canvasMonitor.style.margin = "auto";
                }
                this.container.style.backgroundColor = "black";
                this.container.doFullScreen();
                fSuccess = true;
            }
            if (this.input) this.input.setFocus();
        }
        return fSuccess;
    }

    /**
     * onFullScreen(fFullScreen)
     *
     * @this {Monitor}
     * @param {boolean} [fFullScreen] (undefined if there was a full-screen error)
     */
    onFullScreen(fFullScreen)
    {
        if (!fFullScreen && this.container) {
            if (!this.fStyleCanvasFullScreen) {
                this.container.style.width = this.container.style.height = "";
            } else {
                this.canvasMonitor.style.width = this.canvasMonitor.style.height = "";
            }
        }
        if (DEBUG) this.printf(MESSAGE.SCREEN, "onFullScreen(%b)\n", fFullScreen);
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Monitor}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        if (on) {
            this.initCache();
            this.updateScreen();
        } else {
            this.blankMonitor();
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Monitor}
     */
    onReset()
    {
        this.blankMonitor();
    }
}

Monitor.BINDING = {
    CANVAS:     "canvas",
    CONTAINER:  "container",
    FULLSCREEN: "fullScreen"
};

Defs.CLASSES["Monitor"] = Monitor;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/time.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ id: string, callBack: function(), msAuto: number, nCyclesLeft: number }} */
var Timer;

/** @typedef {{ class: string, bindings: (Object|undefined), version: (number|undefined), overrides: (Array.<string>|undefined), cyclesMinimum: (number|undefined), cyclesMaximum: (number|undefined), cyclesPerSecond: (number|undefined), yieldsPerSecond: (number|undefined), yieldsPerUpdate: (number|undefined), requestAnimationFrame: (boolean|undefined), clockByFrame: (boolean|undefined) }} */
var TimeConfig;

/**
 * @class {Time}
 * @unrestricted
 * @property {TimeConfig} config
 * @property {number} nCyclesMinimum
 * @property {number} nCyclesMaximum
 * @property {number} nCyclesPerSecond
 * @property {number} nYieldsPerSecond
 * @property {number} nYieldsPerUpdate
 * @property {boolean} fClockByFrame
 */
class Time extends Device {
    /**
     * Time(idMachine, idDevice, config)
     *
     * Sample config:
     *
     *      "clock": {
     *        "class": "Time",
     *        "cyclesPerSecond": 650000,
     *        "clockByFrame": true,
     *        "bindings": {
     *          "run": "runTI57",
     *          "speed": "speedTI57",
     *          "step": "stepTI57"
     *        },
     *        "overrides": ["cyclesPerSecond","yieldsPerSecond","yieldsPerUpdate"]
     *      }
     *
     * @this {Time}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {TimeConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        /*
         * NOTE: The default speed of 650,000Hz (0.65Mhz) was a crude approximation based on real world TI-57
         * device timings.  I had originally assumed the speed as 1,600,000Hz (1.6Mhz), based on timing information
         * in TI's patents, but in hindsight, that speed seems rather high for a mid-1970's device, and reality
         * suggests it was much lower.  The TMS-1500 does burn through a lot of cycles (minimum of 128) per instruction,
         * but either that cycle burn was much higher, or the underlying clock speed was much lower.  I assume the latter.
         */
        this.nCyclesMinimum = this.getDefaultNumber('cyclesMinimum', 100000);
        this.nCyclesMaximum = this.getDefaultNumber('cyclesMaximum', 3000000);
        this.nCyclesPerSecond = this.getBounded(this.getDefaultNumber('cyclesPerSecond', 650000), this.nCyclesMinimum, this.nCyclesMaximum);
        this.nYieldsPerSecond = this.getBounded(this.getDefaultNumber('yieldsPerSecond', Time.YIELDS_PER_SECOND), 30, 120);
        this.nYieldsPerUpdate = this.getBounded(this.getDefaultNumber('yieldsPerUpdate', Time.YIELDS_PER_UPDATE), 1, this.nYieldsPerSecond);
        this.fClockByFrame = this.getDefaultBoolean('clockByFrame', this.nCyclesPerSecond <= 120);
        this.fRequestAnimationFrame = this.fClockByFrame || this.getDefaultBoolean('requestAnimationFrame', true);

        this.nBaseMultiplier = this.nCurrentMultiplier = this.nTargetMultiplier = 1;
        this.mhzBase = (this.nCyclesPerSecond / 10000) / 100;
        this.mhzCurrent = this.mhzTarget = this.mhzBase * this.nTargetMultiplier;
        this.nYields = 0;
        this.msYield = Math.round(1000 / this.nYieldsPerSecond);
        this.aAnimations = [];
        this.aClocks = [];
        this.aTimers = [];
        this.aUpdates = [];
        this.fPowered = this.fRunning = this.fYield = this.fThrottling = false;
        this.nStepping = 0;
        this.idRunTimeout = this.idStepTimeout = 0;
        this.onRunTimeout = this.run.bind(this);
        this.onAnimationFrame = this.animate.bind(this);
        this.requestAnimationFrame = (window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.setTimeout).bind(window);

        if (this.fClockByFrame) {
            /*
            * When clocking exclusively by animation frames, setSpeed() calculates how many cycles
            * each animation frame should "deposit" in our cycle bank:
            *
            *      this.nCyclesDepositPerFrame = (nCyclesPerSecond / 60) + 0.00000001;
            *
            * After that amount is added to our "balance" (this.nCyclesDeposited), we make a "withdrawal"
            * whenever the balance is >= 1.0 and call all our clocking functions with the maximum number
            * of cycles we were able to withdraw.
            *
            * setSpeed() also adds a tiny amount of "interest" to each "deposit" (0.00000001); otherwise
            * you can end up in situations where the deposit amount is, say, 0.2499999 instead of 0.25,
            * and four such deposits would still fall short of the 1-cycle threshold.
            */
            this.nCyclesDeposited = this.nCyclesDepositPerFrame = 0;
        }
        else {
            /*
            * When fClockByFrame is true, we rely exclusively on requestAnimationFrame() instead of setTimeout()
            * to drive the clock, which means we automatically yield after every frame, so no yield timer is required.
            */
            let time = this;
            this.timerYield = this.addTimer("timerYield", function onYield() {
                time.onYield();
            }, this.msYield);
        }

        this.resetSpeed();
    }

    /**
     * addAnimation(callBack)
     *
     * Animation functions used to be called with YIELDS_PER_SECOND frequency, when animate() was called
     * on every onYield() call, but now we rely on requestAnimationFrame(), so the frequency is browser-dependent
     * (but presumably at least 60Hz).
     *
     * @this {Time}
     * @param {function(number)} callBack
     */
    addAnimation(callBack)
    {
        this.aAnimations.push(callBack);
    }

    /**
     * addBinding(binding, element)
     *
     * @this {Time}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let time = this, elementInput;

        switch(binding) {

        case Time.BINDING.RUN:
            element.onclick = function onClickRun() {
                time.onRun();
            };
            break;

        case Time.BINDING.STEP:
            element.onclick = function onClickStep() {
                time.onStep();
            };
            break;

        case Time.BINDING.THROTTLE:
            elementInput = /** @type {HTMLInputElement} */ (element);
            elementInput.addEventListener("mousedown", function onThrottleStart() {
                time.fThrottling = true;
            });
            elementInput.addEventListener("mouseup", function onThrottleStop() {
                time.setSpeedThrottle();
                time.fThrottling = false;
            });
            elementInput.addEventListener("mousemove", function onThrottleChange() {
                if (time.fThrottling) {
                    time.setSpeedThrottle();
                }
            });
            elementInput.addEventListener("change", function onThrottleChange() {
                time.fThrottling = true;
                time.setSpeedThrottle();
                time.fThrottling = false;
            });
            break;
        }
        super.addBinding(binding, element);
    }

    /**
     * addClock(callBack)
     *
     * Adds a clock function that's called from doBurst() to process a specified number of cycles.
     *
     * @this {Time}
     * @param {function(number)} callBack
     */
    addClock(callBack)
    {
        this.aClocks.push(callBack);
    }

    /**
     * addTimer(id, callBack, msAuto)
     *
     * Devices that want to have timers that fire after some number of milliseconds call addTimer() to create
     * the timer, and then setTimer() when they want to arm it.  Alternatively, they can specify an automatic
     * timeout value (in milliseconds) to have the timer fire automatically at regular intervals.  There is
     * currently no removeTimer() because these are generally used for the entire lifetime of a device.
     *
     * A timer is initially dormant; dormant timers have a cycle count of -1 (although any negative number will
     * suffice) and active timers have a non-negative cycle count.
     *
     * @this {Time}
     * @param {string} id
     * @param {function()} callBack
     * @param {number} [msAuto] (if set, enables automatic setTimer calls)
     * @return {number} timer index (1-based)
     */
    addTimer(id, callBack, msAuto = -1)
    {
        let nCyclesLeft = -1;
        let iTimer = this.aTimers.length + 1;
        this.aTimers.push({id, callBack, msAuto, nCyclesLeft});
        if (msAuto >= 0) this.setTimer(iTimer, msAuto);
        return iTimer;
    }

    /**
     * addUpdate(callBack)
     *
     * Adds an update function that's called from update(), either as the result of periodic updates
     * from onYield(), single-step updates from step(), or transitional updates from start() and stop().
     *
     * @this {Time}
     * @param {function(boolean)} callBack
     */
    addUpdate(callBack)
    {
        this.aUpdates.push(callBack);
    }

    /**
     * animate(t)
     *
     * This is the callback function we supply to requestAnimationFrame().  The callback has a single
     * (DOMHighResTimeStamp) argument, which indicates the current time (returned from performance.now())
     * for when requestAnimationFrame() starts to fire callbacks.
     *
     * See: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
     *
     * @this {Time}
     * @param {number} [t]
     */
    animate(t)
    {
        if (this.fClockByFrame) {
            /*
             * Mimic the logic in run()
             */
            if (!this.fRunning) return;
            this.snapStart();
            try {
                this.fYield = false;
                do {
                    /*
                     * Execute the burst and then update all timers.
                     */
                    this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerFrame())));
                } while (this.fRunning && !this.fYield);
            }
            catch (err) {
                this.println(err.message);
                this.stop();
                return;
            }
            this.snapStop();
        }
        for (let i = 0; i < this.aAnimations.length; i++) {
            this.aAnimations[i](t);
        }
        if (this.fRunning && this.fRequestAnimationFrame) this.requestAnimationFrame(this.onAnimationFrame);
    }

    /**
     * calcCycles()
     *
     * Calculate the maximum number of cycles we should attempt to process before the next yield.
     *
     * @this {Time}
     */
    calcCycles()
    {
        let nMultiplier = this.mhzCurrent / this.mhzBase;
        if (!nMultiplier || nMultiplier > this.nTargetMultiplier) {
            nMultiplier = this.nTargetMultiplier;
        }
        /*
         * nCyclesPerYield is now allowed to be a fractional number, so that for machines configured
         * to run at an extremely slow speed (eg, less than 60Hz), a fractional value here will signal
         * to snapStop() that it should increase msYield to a proportionally higher value.
         */
        this.nCyclesPerYield = (this.nCyclesPerSecond / this.nYieldsPerSecond * nMultiplier);
        this.nCurrentMultiplier = nMultiplier;
    }

    /**
     * calcSpeed(nCycles, msElapsed)
     *
     * @this {Time}
     * @param {number} nCycles
     * @param {number} msElapsed
     */
    calcSpeed(nCycles, msElapsed)
    {
        if (msElapsed) {
            this.mhzCurrent = (nCycles / (msElapsed * 10)) / 100;
        }
    }

    /**
     * doBurst(nCycles)
     *
     * @this {Time}
     * @param {number} nCycles
     * @return {number} (number of cycles actually executed)
     */
    doBurst(nCycles)
    {
        this.nCyclesBurst = this.nCyclesRemain = nCycles;
        if (!this.aClocks.length) {
            this.nCyclesRemain = 0;
            return this.nCyclesBurst;
        }
        let iClock = 0;
        while (this.nCyclesRemain > 0) {
            if (iClock < this.aClocks.length) {
                nCycles = this.aClocks[iClock++](nCycles) || 1;
            } else {
                iClock = nCycles = 0;
            }
            this.nCyclesRemain -= nCycles;
        }
        return this.nCyclesBurst - this.nCyclesRemain;
    }

    /**
     * doOutside(fn)
     *
     * Use this function to perform any work outside of normal time (eg, DOM updates),
     * to prevent that work from disrupting our speed calculations.
     *
     * @this {Time}
     * @param {function()} fn (should return true only if the function actually performed any work)
     * @return {boolean}
     */
    doOutside(fn)
    {
        let msStart = Date.now();
        if (fn()) {
            let msStop = Date.now();
            this.msOutsideThisRun += msStop - msStart;
            return true;
        }
        return false;
    }

    /**
     * endBurst(nCycles)
     *
     * @this {Time}
     * @param {number} [nCycles]
     * @return {number} (number of cycles executed in burst)
     */
    endBurst(nCycles = this.nCyclesBurst - this.nCyclesRemain)
    {
        if (this.fClockByFrame) {
            if (!this.fRunning) {
                if (this.nCyclesDeposited) {
                    for (let iClock = 0; iClock < this.aClocks.length; iClock++) {
                        this.aClocks[iClock](-1);
                    }
                }
                this.nCyclesDeposited = nCycles;
            }
            this.nCyclesDeposited -= nCycles;
            if (this.nCyclesDeposited < 1) {
                this.onYield();
            }
        }
        this.nCyclesBurst = this.nCyclesRemain = 0;
        this.nCyclesThisRun += nCycles;
        this.nCyclesRun += nCycles;
        if (!this.fRunning) this.nCyclesRun = 0;
        return nCycles;
    }

    /**
     * getCycles(ms)
     *
     * If no time period is specified, this returns the current number of cycles per second.
     *
     * @this {Time}
     * @param {number} ms (default is 1000)
     * @return {number} number of corresponding cycles
     */
    getCycles(ms = 1000)
    {
        return Math.ceil((this.nCyclesPerSecond * this.nCurrentMultiplier) / 1000 * ms);
    }

    /**
     * getCyclesPerBurst()
     *
     * This tells us how many cycles to execute as a burst.
     *
     * @this {Time}
     * @return {number} (the maximum number of cycles we should execute in the next burst)
     */
    getCyclesPerBurst()
    {
        let nCycles = this.getCycles(this.msYield);
        for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
            let timer = this.aTimers[iTimer-1];

            if (timer.nCyclesLeft < 0) continue;
            if (nCycles > timer.nCyclesLeft) {
                nCycles = timer.nCyclesLeft;
            }
        }
        return nCycles;
    }

    /**
     * getCyclesPerFrame(nMinCycles)
     *
     * This tells us how many cycles to execute per frame (assuming fClockByFrame).
     *
     * @this {Time}
     * @param {number} [nMinCycles]
     * @return {number} (the maximum number of cycles we should execute in the next burst)
     */
    getCyclesPerFrame(nMinCycles=0)
    {
        let nCycles;
        if (nMinCycles) {
            nCycles = nMinCycles;
            this.nCyclesDeposited += nMinCycles;
        } else {
            nCycles = this.nCyclesDeposited;
            if (nCycles < 1) {
                nCycles = (this.nCyclesDeposited += this.nCyclesDepositPerFrame);
            }
            nCycles |= 0;
            for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
                let timer = this.aTimers[iTimer-1];

                if (timer.nCyclesLeft < 0) continue;
                if (nCycles > timer.nCyclesLeft) {
                    nCycles = timer.nCyclesLeft;
                }
            }
        }
        return nCycles;
    }

    /**
     * getSpeed(mhz)
     *
     * @this {Time}
     * @param {number} mhz
     * @return {string} the given speed, as a formatted string
     */
    getSpeed(mhz)
    {
        let s;
        if (mhz >= 1) {
            s = mhz.toFixed(2) + "Mhz";
        } else {
            let hz = Math.round(mhz * 1000000);
            if (hz <= 999) {
                s = hz + "Hz";
            } else {
                s = Math.ceil(hz / 1000) + "Khz";
            }
        }
        return s;
    }

    /**
     * getSpeedCurrent()
     *
     * @this {Time}
     * @return {string} the current speed, as a formatted string
     */
    getSpeedCurrent()
    {
        return (this.fRunning && this.mhzCurrent)? this.getSpeed(this.mhzCurrent) : "Stopped";
    }

    /**
     * getSpeedTarget()
     *
     * @this {Time}
     * @return {string} the target speed, as a formatted string
     */
    getSpeedTarget()
    {
        return this.getSpeed(this.mhzTarget);
    }

    /**
     * isPowered()
     *
     * @this {Time}
     * @return {boolean} true if powered, false if not
     */
    isPowered()
    {
        if (!this.fPowered) {
            this.println("not powered");
            return false;
        }
        return true;
    }

    /**
     * isRunning()
     *
     * @this {Time}
     * @return {boolean}
     */
    isRunning()
    {
        return this.fRunning;
    }

    /**
     * isTimerSet(iTimer)
     *
     * NOTE: Even if the timer is armed, we return false if the clock is currently stopped;
     * in that sense, perhaps this function should be named isTimerArmedAndWillItFireOnTime().
     *
     * @this {Time}
     * @param {number} iTimer
     * @return {boolean}
     */
    isTimerSet(iTimer)
    {
        if (this.fRunning) {
            if (iTimer > 0 && iTimer <= this.aTimers.length) {
                let timer = this.aTimers[iTimer - 1];
                return (timer.nCyclesLeft >= 0);
            }
        }
        return false;
    }

    /**
     * notifyTimers(nCycles)
     *
     * Used by run() to reduce all active timer countdown values by the number of cycles just executed;
     * this is the function that actually "fires" any timer(s) whose countdown has reached (or dropped below)
     * zero, invoking their callback function.
     *
     * @this {Time}
     * @param {number} nCycles (number of cycles actually executed)
     */
    notifyTimers(nCycles)
    {
        if (nCycles >= 1) {
            for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
                let timer = this.aTimers[iTimer-1];

                if (timer.nCyclesLeft < 0) continue;
                timer.nCyclesLeft -= nCycles;
                if (timer.nCyclesLeft <= 0) {
                    timer.nCyclesLeft = -1; // zero is technically an "active" value, so ensure the timer is dormant now
                    timer.callBack();       // safe to invoke the callback function now
                    if (timer.msAuto >= 0) {
                        this.setTimer(iTimer, timer.msAuto);
                    }
                }
            }
        }
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Time}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        this.fPowered = on;
    }

    /**
     * onRun()
     *
     * This handles the "run" button, if any, attached to the Time device.
     *
     * Note that this serves a different purpose than the "power" button that's managed by the Input device,
     * because toggling power also requires resetting the program counter prior to start() OR clearing the display
     * after stop().
     *
     * @this {Time}
     */
    onRun()
    {
        if (this.isPowered()) {
            if (this.fRunning) {
                this.stop();
            } else {
                this.start();
            }
        }
    }

    /**
     * onStep(nRepeat)
     *
     * This handles the "step" button, if any, attached to the Time device.
     *
     * @this {Time}
     * @param {number} [nRepeat]
     */
    onStep(nRepeat)
    {
        if (this.isPowered()) {
            if (!this.fRunning) {
                if (this.nStepping) {
                    this.stop();
                } else {
                    this.step(nRepeat);
                }
            } else {
                this.println("already running");
            }
        }
    }

    /**
     * onYield()
     *
     * @this {Time}
     */
    onYield()
    {
        this.fYield = true;
        let nYields = this.nYields;
        let nCyclesPerSecond = this.getCycles();
        if (nCyclesPerSecond >= this.nYieldsPerSecond) {
            this.nYields++;
        } else {
            /*
             * Let's imagine that nCyclesPerSecond has dropped to 4, whereas the usual nYieldsPerSecond is 60;
             * that's means we're yielding at 1/15th the usual rate, so to compensate, we want to bump nYields
             * by 15 instead of 1.
             */
            this.nYields += Math.ceil(this.nYieldsPerSecond / nCyclesPerSecond);
        }
        if (this.nYields >= this.nYieldsPerUpdate && nYields < this.nYieldsPerUpdate) {
            this.update();
        }
        if (this.nYields >= this.nYieldsPerSecond) {
            this.nYields = 0;
        }
    }

    /**
     * resetSpeed()
     *
     * Resets speed and cycle information as part of any reset() or restore(); this typically occurs during powerUp().
     * It's important that this be called BEFORE the actual restore() call, because restore() may want to call setSpeed(),
     * which in turn assumes that all the cycle counts have been initialized to sensible values.
     *
     * @this {Time}
     */
    resetSpeed()
    {
        this.nCyclesRun = this.nCyclesBurst = this.nCyclesRemain = 0;
        if (!this.setSpeedThrottle()) this.setSpeed(this.nBaseMultiplier);
    }

    /**
     * resetTimers()
     *
     * When the target speed multiplier is altered, it's a good idea to run through all the timers that
     * have a fixed millisecond period and re-arm them, because the timers are using cycle counts that were based
     * on a previous multiplier.
     *
     * @this {Time}
     */
    resetTimers()
    {
        for (let iTimer = this.aTimers.length; iTimer > 0; iTimer--) {
            let timer = this.aTimers[iTimer-1];
            if (timer.msAuto >= 0) this.setTimer(iTimer, timer.msAuto, true);
        }
    }

    /**
     * run()
     *
     * @this {Time}
     */
    run()
    {
        this.idRunTimeout = 0;
        if (!this.fRunning) return;
        this.snapStart();
        try {
            this.fYield = false;
            do {
                /*
                 * Execute the burst and then update all timers.
                 */
                this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerBurst())));

            } while (this.fRunning && !this.fYield);
        }
        catch(err) {
            this.println(err.message);
            this.stop();
            return;
        }
        if (this.fRunning) {

            this.idRunTimeout = setTimeout(this.onRunTimeout, this.snapStop());
            if (!this.fRequestAnimationFrame) this.animate();
        }
    }

    /**
     * setSpeedThrottle()
     *
     * This handles speed adjustments requested by the throttling slider.
     *
     * @this {Time}
     * @return {boolean} (true if a throttle exists, false if not)
     */
    setSpeedThrottle()
    {
        /*
         * We're not going to assume any direct relationship between the slider's min/max/value
         * and our own nCyclesMinimum/nCyclesMaximum/nCyclesPerSecond.  We're just going to calculate
         * a new target nCyclesPerSecond that is proportional, and then convert that to a speed multiplier.
         */
        let elementInput = this.bindings[Time.BINDING.THROTTLE];
        if (elementInput) {
            let ratio = (elementInput.value - elementInput.min) / (elementInput.max - elementInput.min);
            let nCycles = Math.floor((this.nCyclesMaximum - this.nCyclesMinimum) * ratio + this.nCyclesMinimum);
            let nMultiplier = nCycles / this.nCyclesPerSecond;

            this.setSpeed(nMultiplier);
            return true;
        }
        return false;
    }

    /**
     * setSpeed(nMultiplier)
     *
     * @desc Whenever the speed is changed, the running cycle count and corresponding start time must be reset,
     * so that the next effective speed calculation obtains sensible results.  In fact, when run() initially calls
     * setSpeed() with no parameters, that's all this function does (it doesn't change the current speed setting).
     *
     * @this {Time}
     * @param {number} [nMultiplier] is the new proposed multiplier (reverts to default if target was too high)
     * @return {boolean} true if successful, false if not
     */
    setSpeed(nMultiplier)
    {
        let fSuccess = true;
        if (nMultiplier !== undefined) {
            /*
             * If we haven't reached 90% (0.9) of the current target speed, revert to the default multiplier.
             */
            if (!this.fThrottling && this.mhzCurrent > 0 && this.mhzCurrent < this.mhzTarget * 0.9) {
                nMultiplier = this.nBaseMultiplier;
                fSuccess = false;
            }
            this.nTargetMultiplier = nMultiplier;
            let mhzTarget = this.mhzBase * this.nTargetMultiplier;
            if (this.mhzTarget != mhzTarget) {
                this.mhzTarget = mhzTarget;
                this.setBindingText(Time.BINDING.SPEED, this.getSpeedTarget());
            }
            /*
             * After every yield, calcSpeed() will update mhzCurrent, but we also need to be optimistic
             * and set it to the mhzTarget now, so that the next calcCycles() call will make a reasonable
             * initial estimate.
             */
            this.mhzCurrent = this.mhzTarget;
        }
        if (this.fClockByFrame) {
            let nCyclesPerSecond = this.mhzCurrent * 1000000;
            this.nCyclesDepositPerFrame = (nCyclesPerSecond / 60) + 0.00000001;
            this.nCyclesDeposited = 0;
        }
        this.nCyclesRun = 0;
        this.msStartRun = this.msEndRun = 0;
        this.calcCycles();      // calculate a new value for the current cycle multiplier
        this.resetTimers();     // and then update all the fixed-period timers using the new cycle multiplier
        return fSuccess;
    }

    /**
     * setTimer(iTimer, ms, fReset)
     *
     * Using the timer index from a previous addTimer() call, this sets that timer to fire after the
     * specified number of milliseconds.
     *
     * @this {Time}
     * @param {number} iTimer
     * @param {number} ms (converted into a cycle countdown internally)
     * @param {boolean} [fReset] (true if the timer should be reset even if already armed)
     * @return {number} (number of cycles used to arm timer, or -1 if error)
     */
    setTimer(iTimer, ms, fReset)
    {
        let nCycles = -1;
        if (iTimer > 0 && iTimer <= this.aTimers.length) {
            let timer = this.aTimers[iTimer-1];
            if (fReset || timer.nCyclesLeft < 0) {
                nCycles = this.getCycles(ms);
                /*
                 * If we're currently executing a burst of cycles, the number of cycles it has executed in
                 * that burst so far must NOT be charged against the cycle timeout we're about to set.  The simplest
                 * way to resolve that is to immediately call endBurst() and bias the cycle timeout by the number
                 * of cycles that the burst executed.
                 */
                if (this.fRunning) {
                    nCycles += this.endBurst();
                }
                timer.nCyclesLeft = nCycles;
            }
        }
        return nCycles;
    }

    /**
     * snapStart()
     *
     * @this {Time}
     */
    snapStart()
    {
        this.calcCycles();

        this.nCyclesThisRun = 0;
        this.msOutsideThisRun = 0;
        this.msStartThisRun = Date.now();
        if (!this.msStartRun) this.msStartRun = this.msStartThisRun;

        /*
         * Try to detect situations where the browser may have throttled us, such as when the user switches
         * to a different tab; in those situations, Chrome and Safari may restrict setTimeout() callbacks
         * to roughly one per second.
         *
         * Another scenario: the user resizes the browser window.  setTimeout() callbacks are not throttled,
         * but there can still be enough of a lag between the callbacks that speed will be noticeably
         * erratic if we don't compensate for it here.
         *
         * We can detect throttling/lagging by verifying that msEndRun (which was set at the end of the
         * previous run and includes any requested sleep time) is comparable to the current msStartThisRun;
         * if the delta is significant, we compensate by bumping msStartRun forward by that delta.
         *
         * This shouldn't be triggered when the Debugger stops time, because setSpeed() -- which is called
         * whenever the time starts again -- zeroes msEndRun.
         */
        let msDelta = 0;
        if (this.msEndRun) {
            msDelta = this.msStartThisRun - this.msEndRun;
            if (msDelta > this.msYield) {
                this.msStartRun += msDelta;
                /*
                 * Bumping msStartRun forward should NEVER cause it to exceed msStartThisRun; however, just
                 * in case, I make absolutely sure it cannot happen, since doing so could result in negative
                 * speed calculations.
                 */

                if (this.msStartRun > this.msStartThisRun) {
                    this.msStartRun = this.msStartThisRun;
                }
            }
        }
    }

    /**
     * snapStop()
     *
     * @this {Time}
     * @return {number}
     */
    snapStop()
    {
        this.msEndRun = Date.now();

        if (this.msOutsideThisRun) {
            this.msStartRun += this.msOutsideThisRun;
            this.msStartThisRun += this.msOutsideThisRun;
        }

        let msYield = this.msYield;
        if (this.nCyclesThisRun) {
            /*
             * Normally, we assume we executed a full quota of work over msYield.  If nCyclesThisRun is correct,
             * then the ratio of nCyclesThisRun/nCyclesPerYield should represent the percentage of work we performed,
             * and so applying that percentage to msYield should give us a better estimate of work vs. time.
             */
            msYield = Math.round(msYield * this.nCyclesThisRun / this.nCyclesPerYield);
        }

        let msElapsedThisRun = this.msEndRun - this.msStartThisRun;
        let msRemainsThisRun = msYield - msElapsedThisRun;

        let nCycles = this.nCyclesRun;
        let msElapsed = this.msEndRun - this.msStartRun;

        if (DEBUG && msRemainsThisRun < 0 && this.nTargetMultiplier > 1) {
            this.println("warning: updates @" + msElapsedThisRun + "ms (prefer " + Math.round(msYield) + "ms)");
        }

        this.calcSpeed(nCycles, msElapsed);

        if (msRemainsThisRun < 0) {
            /*
             * Try "throwing out" the effects of large anomalies, by moving the overall run start time up;
             * ordinarily, this should only happen when the someone is using an external Debugger or some other
             * tool or feature that is interfering with our overall execution.
             */
            if (msRemainsThisRun < -1000) {
                this.msStartRun -= msRemainsThisRun;
            }
            /*
             * If the last burst took MORE time than we allotted (ie, it's taking more than 1 second to simulate
             * nCyclesPerSecond), all we can do is yield for as little time as possible (ie, 0ms) and hope that the
             * simulation is at least usable.
             */
            msRemainsThisRun = 0;
        }
        else if (this.mhzCurrent < this.mhzTarget) {
            msRemainsThisRun = 0;
        }

        this.msEndRun += msRemainsThisRun;

        this.printf(MESSAGE.TIMER, "after running %d cycles, resting for %dms\n", this.nCyclesThisRun, msRemainsThisRun);

        return msRemainsThisRun;
    }

    /**
     * start()
     *
     * @this {Time}
     * @return {boolean}
     */
    start()
    {
        if (this.fRunning || this.nStepping) {
            return false;
        }

        if (this.idRunTimeout) {
            clearTimeout(this.idRunTimeout);
            this.idRunTimeout = 0;
        }

        this.fRunning = true;
        this.msStartRun = this.msEndRun = 0;
        this.update(true);

        /*
         * Kickstart both the clocks and requestAnimationFrame; it's a little premature to start
         * animation here, because the first run() should take place before the first animate(), but
         * since clock speed is now decoupled from animation speed, this isn't something we should
         * worry about.
         */
        if (!this.fClockByFrame) {

            this.idRunTimeout = setTimeout(this.onRunTimeout, 0);
        }
        if (this.fRequestAnimationFrame) this.requestAnimationFrame(this.onAnimationFrame);
        return true;
    }

    /**
     * step(nRepeat)
     *
     * @this {Time}
     * @param {number} [nRepeat]
     * @return {boolean} true if successful, false if already running
     */
    step(nRepeat = 1)
    {
        if (!this.fRunning) {
            if (nRepeat && !this.nStepping) {
                this.nStepping = nRepeat;
            }
            if (this.nStepping) {
                /*
                 * Execute a minimum-cycle burst and then update all timers.
                 */
                this.nStepping--;
                this.notifyTimers(this.endBurst(this.doBurst(this.getCyclesPerFrame(1))));
                this.update(false);
                if (this.nStepping) {
                    let time = this;
                    this.idStepTimeout = setTimeout(function onStepTimeout() {
                        time.step(0);
                    }, 0);
                    return true;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * stop()
     *
     * @this {Time}
     * @return {boolean} true if successful, false if already stopped
     */
    stop()
    {
        if (this.nStepping) {
            this.nStepping = 0;
            this.update(true);
            return true;
        }
        if (this.fRunning) {
            this.fRunning = false;
            this.endBurst();
            this.update(true);
            return true;
        }
        return false;
    }

    /**
     * update(fTransition)
     *
     * Used for periodic updates from onYield(), single-step updates from step(), and transitional updates
     * from start() and stop().
     *
     * fTransition is set to true by start() and stop() calls, because the machine is transitioning to or from
     * a running state; it is set to false by step() calls, because the machine state changed but it never entered
     * a running state; and it is undefined in all other situations,
     *
     * When we call the update handlers, we set fTransition to true for all of the start(), stop(), and step()
     * cases, because there has been a "transition" in the overall state, just not the running state.
     *
     * @this {Time}
     * @param {boolean} [fTransition]
     */
    update(fTransition)
    {
        if (fTransition) {
            if (this.fRunning) {
                this.println("started with " + this.getSpeedTarget() + " target" + (DEBUG? " using " + (this.fClockByFrame? "requestAnimationFrame()" : "setTimeout()") : ""));
            } else {
                this.println("stopped");
            }
        }

        this.setBindingText(Time.BINDING.RUN, this.fRunning? "Halt" : "Run");
        this.setBindingText(Time.BINDING.STEP, this.nStepping? "Stop" : "Step");
        if (!this.fThrottling) {
            this.setBindingText(Time.BINDING.SPEED, this.getSpeedCurrent());
        }

        for (let i = 0; i < this.aUpdates.length; i++) {
            this.aUpdates[i](fTransition != undefined);
        }
    }
}

Time.BINDING = {
    RUN:        "run",
    SPEED:      "speed",
    STEP:       "step",
    THROTTLE:   "throttle"
};

/*
 * We yield more often now (120 times per second instead of 60), to help ensure that requestAnimationFrame()
 * callbacks can be called as timely as possible.  And we still only want to perform DOM-related status updates
 * no more than twice per second, so the required number of yields before each update has been increased as well.
 */
Time.YIELDS_PER_SECOND = 120;
Time.YIELDS_PER_UPDATE = 60;

Defs.CLASSES["Time"] = Time;

/**
 * @copyright https://www.pcjs.org/modules/devices/vt100/chips.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {Chips}
 * @unrestricted
 */
class Chips extends Device {
    /**
     * Chips(idMachine, idDevice, config)
     *
     * @this {Chips}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.ports = /** @type {Ports} */ (this.findDeviceByClass("Ports"));
        for (let port in Chips.LISTENERS) {
            let listeners = Chips.LISTENERS[port];
            this.ports.addListener(+port, listeners[0], listeners[1], this);
        }
        this.onReset();
    }

    /**
     * onPower()
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Chips}
     */
    onPower()
    {
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Chips}
     */
    onReset()
    {
        this.bBrightness    = Chips.BRIGHTNESS.INIT;
        this.bFlags         = Chips.FLAGS.NO_AVO | Chips.FLAGS.NO_GFX;
        this.bDC011Cols     = Chips.DC011.INITCOLS;
        this.bDC011Rate     = Chips.DC011.INITRATE;
        this.bDC012Scroll   = Chips.DC012.INITSCROLL;
        this.bDC012Blink    = Chips.DC012.INITBLINK;
        this.bDC012Reverse  = Chips.DC012.INITREVERSE;
        this.bDC012Attr     = Chips.DC012.INITATTR;
        this.dNVRAddr       = 0;
        this.wNVRData       = 0;
        this.bNVRLatch      = 0;
        this.bNVROut        = 0;
       /*
        * The following array contains the data we use to initialize all (100) words of NVR (Non-Volatile RAM).
        *
        * I used to initialize every word to 0x3ff, as if the NVR had been freshly erased, but that causes the
        * firmware to (attempt to) beep and then display an error code (2).  As the DEC Technical Manual says:
        *
        *      If the NVR fails, the bell sounds several times to inform the operator, and then default settings
        *      stored in the ROM allow the terminal to work.
        *
        * but I think what they meant to say is that default settings are stored in the RAM copy of NVR.  So then
        * I went into SET-UP, pressed SHIFT-S to save those settings back to NVR, and then used the PC8080 debugger
        * "d nvr" command to dump the NVR contents.  The results are below.
        *
        * The first dump actually contains only two modifications to the factory defaults: enabling ONLINE instead
        * of LOCAL operation, and turning ANSI support ON.  The second dump is unmodified (the TRUE factory defaults).
        *
        * By making selective changes, you can discern where the bits for certain features are stored.  For example,
        * smooth-scrolling is apparently controlled by bit 7 of the word at offset 0x2B (and is ON by default in
        * the factory settings).  And it's likely that the word at offset 0x32 (ie, the last word that's not zero)
        * is the NVR checksum.
        *
        * The TRUE factory defaults are here for reference:
        *
        *   0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
        *   0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
        *   0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
        *   0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E00,
        *   0x2E08, 0x2E8E, 0x2E20, 0x2ED0, 0x2E50, 0x2E00, 0x2E20, 0x2E00, 0x2EE0, 0x2EE0,
        *   0x2E69, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
        *   0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
        *   0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
        *   0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
        *   0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000
        */
       this.aNVRWords = [
           0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
           0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
           0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80,
           0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E80, 0x2E00,
           0x2E08, 0x2E8E, 0x2E00, 0x2ED0, 0x2E70, 0x2E00, 0x2E20, 0x2E00, 0x2EE0, 0x2EE0,
           0x2E7D, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
           0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
           0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
           0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
           0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000
        ];
    }

    /**
     * getLBA(iBit)
     *
     * Returns the state of the requested (simulated) LBA bit.
     *
     * NOTE: This is currently only used to obtain LBA7, which we approximate with the slightly faster approach
     * of masking bit 6 of the CPU cycle count (see the DC011 discussion above).  This will result in a shorter LBA7
     * period than if we divided the cycle count by 88, but a shorter LBA7 period is probably helpful in terms of
     * overall performance.
     *
     * @this {Chips}
     * @param {number} iBit
     * @return {number}
     */
    getLBA(iBit)
    {
        return (this.time.getCycles() & (1 << (iBit - 1))) << 1;
    }

    /**
     * getNVRAddr()
     *
     * @this {Chips}
     * @return {number}
     */
    getNVRAddr()
    {
        let i;
        let tens = 0, ones = 0;
        let addr = ~this.dNVRAddr;
        for (i = 0; i < 10; i++) {
            if (addr & 0x1) tens = 9-i;
            addr >>= 1;
        }
        for (i = 0; i < 10; i++) {
            if (addr & 0x1) ones = 9-i;
            addr >>= 1;
        }
        addr = tens*10 + ones;

        return addr;
    }

    /**
     * doNVRCommand()
     *
     * @this {Chips}
     */
    doNVRCommand()
    {
        let addr, data;
        let bit = this.bNVRLatch & 0x1;
        let bCmd = (this.bNVRLatch >> 1) & 0x7;

        switch(bCmd) {
        case Chips.NVR.CMD.STANDBY:
            break;

        case Chips.NVR.CMD.ACCEPT_ADDR:
            this.dNVRAddr = (this.dNVRAddr << 1) | bit;
            break;

        case Chips.NVR.CMD.ERASE:
            addr = this.getNVRAddr();
            this.aNVRWords[addr] = Chips.NVR.WORDMASK;
            this.printf(MESSAGE.CHIPS, "doNVRCommand(): erase data at addr %#06x\n", addr);
            break;

        case Chips.NVR.CMD.ACCEPT_DATA:
            this.wNVRData = (this.wNVRData << 1) | bit;
            break;

        case Chips.NVR.CMD.WRITE:
            addr = this.getNVRAddr();
            data = this.wNVRData & Chips.NVR.WORDMASK;
            this.aNVRWords[addr] = data;
            this.printf(MESSAGE.CHIPS, "doNVRCommand(): write data %#06x to addr %#06x\n", data, addr);
            break;

        case Chips.NVR.CMD.READ:
            addr = this.getNVRAddr();
            data = this.aNVRWords[addr];
            /*
             * If we don't explicitly initialize aNVRWords[], pretend any uninitialized words contains WORDMASK.
             */
            if (data == null) data = Chips.NVR.WORDMASK;
            this.wNVRData = data;
            this.printf(MESSAGE.CHIPS, "doNVRCommand(): read data %#06x from addr %#06x\n", data, addr);
            break;

        case Chips.NVR.CMD.SHIFT_OUT:
            this.wNVRData <<= 1;
            /*
             * Since WORDMASK is 0x3fff, this will mask the shifted data with 0x4000, which is the bit we want to isolate.
             */
            this.bNVROut = this.wNVRData & (Chips.NVR.WORDMASK + 1);
            break;

        default:
            this.printf(MESSAGE.CHIPS, "doNVRCommand(): unrecognized command %#04x\n", bCmd);
            break;
        }
    }

    /**
     * inFlags(port)
     *
     * @this {Chips}
     * @param {number} port (0x42)
     * @return {number} simulated port value
     */
    inFlags(port)
    {
        let value = this.bFlags;

        /*
         * The NVR_CLK bit is driven by LBA7 (ie, bit 7 from Line Buffer Address generation); see the DC011 discussion above.
         */
        value &= ~Chips.FLAGS.NVR_CLK;
        if (this.getLBA(7)) {
            value |= Chips.FLAGS.NVR_CLK;
            if (value != this.bFlags) {
                this.doNVRCommand();
            }
        }

        value &= ~Chips.FLAGS.NVR_DATA;
        if (this.bNVROut) {
            value |= Chips.FLAGS.NVR_DATA;
        }

        value &= ~Chips.FLAGS.KBD_XMIT;
        if (this.kbd && this.kbd.isTransmitterReady()) {
            value |= Chips.FLAGS.KBD_XMIT;
        }

        value &= ~Chips.FLAGS.UART_XMIT;
        if (this.serial && this.serial.isTransmitterReady()) {
            value |= Chips.FLAGS.UART_XMIT;
        }

        this.bFlags = value;
        this.printf(MESSAGE.CHIPS, "inFlags(%#04x): %#04x\n", port, value);
        return value;
    }

    /**
     * outBrightness(port, value)
     *
     * @this {Chips}
     * @param {number} port (0x42)
     * @param {number} value
     */
    outBrightness(port, value)
    {
        this.printf(MESSAGE.CHIPS, "outBrightness(%#04x): %#04x\n", port, value);
        this.bBrightness = value;
    }

    /**
     * outNVRLatch(port, value)
     *
     * @this {Chips}
     * @param {number} port (0x62)
     * @param {number} value
     */
    outNVRLatch(port, value)
    {
        this.printf(MESSAGE.CHIPS, "outNVRLatch(%#04x): %#04x\n", port, value);
        this.bNVRLatch = value;
    }

    /**
     * outDC012(port, value)
     *
     * TODO: Consider whether we should disable any interrupts (eg, vertical retrace) until
     * this port is initialized at runtime.
     *
     * @this {Chips}
     * @param {number} port (0xA2)
     * @param {number} value
     */
    outDC012(port, value)
    {
        this.printf(MESSAGE.CHIPS, "outDC012(%#04x): %#04x\n", port, value);
        let bOpt = value & 0x3;
        let bCmd = (value >> 2) & 0x3;
        switch(bCmd) {
        case 0x0:
            this.bDC012Scroll = (this.bDC012Scroll & ~0x3) | bOpt;
            break;
        case 0x1:
            this.bDC012Scroll = (this.bDC012Scroll & ~0xC) | (bOpt << 2);
            if (this.video) this.video.updateScrollOffset(this.bDC012Scroll);
            break;
        case 0x2:
            switch(bOpt) {
            case 0x0:
                this.bDC012Blink = ~this.bDC012Blink;
                break;
            case 0x1:
                // TODO: Clear vertical frequency interrupt?
                break;
            case 0x2:
            case 0x3:
                this.bDC012Reverse = 0x3 - bOpt;
                break;
            }
            break;
        case 0x3:
            this.bDC012Attr = bOpt;
            break;
        }
    }

    /**
     * outDC011(port, value)
     *
     * @this {Chips}
     * @param {number} port (0xC2)
     * @param {number} value
     */
    outDC011(port, value)
    {
        this.printf(MESSAGE.CHIPS, "outNDC011(%#04x): %#04x\n", port, value);
        if (value & Chips.DC011.RATE60) {
            value &= Chips.DC011.RATE50;
            if (this.bDC011Rate != value) {
                this.bDC011Rate = value;
                if (this.video) {
                    this.video.updateRate(this.bDC011Rate == Chips.DC011.RATE50? 50 : 60);
                }
            }
        } else {
            value &= Chips.DC011.COLS132;
            if (this.bDC011Cols != value) {
                this.bDC011Cols = value;
                if (this.video) {
                    let nCols = (this.bDC011Cols == Chips.DC011.COLS132? 132 : 80);
                    let nRows = (nCols > 80 && (this.bFlags & Chips.FLAGS.NO_AVO)? 14 : 24);
                    this.video.updateDimensions(nCols, nRows);
                }
            }
        }
    }

    /**
     * loadState(state)
     *
     * Memory and Ports states are managed by the Bus onLoad() handler, which calls our loadState() handler.
     *
     * @this {Chips}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.bBrightness    = state.shift();
            this.bFlags         = state.shift();
            this.bDC011Cols     = state.shift();
            this.bDC011Rate     = state.shift();
            this.bDC012Scroll   = state.shift();
            this.bDC012Blink    = state.shift();
            this.bDC012Reverse  = state.shift();
            this.bDC012Attr     = state.shift();
            this.dNVRAddr       = state.shift(); // 20-bit address
            this.wNVRData       = state.shift(); // 14-bit word
            this.bNVRLatch      = state.shift(); // 1 byte
            this.bNVROut        = state.shift(); // 1 bit
            this.aNVRWords      = state.shift(); // 100 14-bit words
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * Memory and Ports states are managed by the Bus onSave() handler, which calls our saveState() handler.
     *
     * @this {Chips}
     * @param {Array} state
     */
    saveState(state)
    {
        state.push(this.idDevice);
        state.push(this.bBrightness);
        state.push(this.bFlags);
        state.push(this.bDC011Cols);
        state.push(this.bDC011Rate);
        state.push(this.bDC012Scroll);
        state.push(this.bDC012Blink);
        state.push(this.bDC012Reverse);
        state.push(this.bDC012Attr);
        state.push(this.dNVRAddr);
        state.push(this.wNVRData);
        state.push(this.bNVRLatch);
        state.push(this.bNVROut);
        state.push(this.aNVRWords);
    }
}

/*
 * One of the many chips in the VT100 is an 8224, which operates at 24.8832MHz.  That frequency is divided by 9
 * to yield a 361.69ns clock period for the 8080 CPU, which means (in theory) that the CPU is running at 2.76Mhz,
 * so the machine should be configured with "cyclesPerSecond" set to 2764800.
 *
 * WARNING: The choice of clock speed has an effect on other simulated VT100 circuits; see the DC011 Timing Chip
 * discussion below, along with the getLBA() function.
 *
 * For reference, here is a list of all the VT100 I/O ports, from /devices/pc8080/machine/vt100/debugger/README.md,
 * which in turn comes from p. 4-17 of the VT100 Technical Manual (July 1982):
 *
 *      READ OR WRITE
 *      00H     PUSART data bus
 *      01H     PUSART command port
 *
 *      WRITE ONLY (Decoded with I/O WR L)
 *      02H     Baud rate generator
 *      42H     Brightness D/A latch
 *      62H     NVR latch
 *      82H     Keyboard UART data input [used to update the Keyboard Status Byte -JP]
 *      A2H     Video processor DC012
 *      C2H     Video processor DC011
 *      E2H     Graphics port
 *
 *      READ ONLY (Decoded with I/O RD L)
 *      22H     Modem buffer
 *      42H     Flags buffer
 *      82H     Keyboard UART data output
 */
Chips.FLAGS = {
    PORT:       0x42,           // read-only
    UART_XMIT:  0x01,           // PUSART transmit buffer empty if SET
    NO_AVO:     0x02,           // AVO present if CLEAR
    NO_GFX:     0x04,           // VT125 graphics board present if CLEAR
    OPTION:     0x08,           // OPTION present if SET
    NO_EVEN:    0x10,           // EVEN FIELD active if CLEAR
    NVR_DATA:   0x20,           // NVR DATA if SET
    NVR_CLK:    0x40,           // NVR CLOCK if SET
    KBD_XMIT:   0x80            // KBD transmit buffer empty if SET
};

Chips.BRIGHTNESS = {
    PORT:       0x42,           // write-only
    INIT:       0x00            // for lack of a better guess
};

/*
 * Reading port 0x82 returns a key address from the VT100 keyboard's UART data output.
 *
 * Every time a keyboard scan is initiated (by setting the START bit of the status byte),
 * our internal address index (iKeyNext) is set to zero, and an interrupt is generated for
 * each entry in the aKeysActive array, along with a final interrupt for KEYLAST.
 */
Chips.ADDRESS = {
    PORT:       0x82,
    INIT:       0x7F
};

/*
 * Writing port 0x82 updates the VT100's keyboard status byte via the keyboard's UART data input.
 */
Chips.STATUS = {
    PORT:       0x82,               // write-only
    LED4:       0x01,
    LED3:       0x02,
    LED2:       0x04,
    LED1:       0x08,
    LOCKED:     0x10,
    LOCAL:      0x20,
    LEDS:       0x3F,               // all LEDs
    START:      0x40,               // set to initiate a scan
    /*
     * From p. 4-38 of the VT100 Technical Manual (July 1982):
     *
     *      A bit (CLICK) in the keyboard status word controls the bell....  When a single status word contains
     *      the bell bit, flip-flop E3 toggles and turns on E1, generating a click. If the bell bit is set for
     *      many words in succession, the UART latch holds the data output constant..., allowing the circuit to
     *      produce an 800 hertz tone. Bell is generated by setting the bell bit for 0.25 seconds.  Each cycle of
     *      the tone is at a reduced amplitude compared with the single keyclick....  The overall effect of the
     *      tone burst on the ear is that of a beep.
     */
    CLICK:      0x80,
    INIT:       0x00
};

/*
 * DC011 is referred to as a Timing Chip.
 *
 * As p. 4-55 (105) of the VT100 Technical Manual (July 1982) explains:
 *
 *      The DCO11 is a custom designed bipolar circuit that provides most of the timing signals required by the
 *      video processor. Internal counters divide the output of a 24.0734 MHz oscillator (located elsewhere on the
 *      terminal controller module) into the lower frequencies that define dot, character, scan, and frame timing.
 *      The counters are programmable through various input pins to control the number of characters per line,
 *      the frequency at which the screen is refreshed, and whether the display is interlaced or noninterlaced.
 *      These parameters can be controlled through SET-UP mode or by the host.
 *
 *          Table 4-6-1: Video Mode Selection (Write Address 0xC2)
 *
 *          D5  D4      Configuration
 *          --  --      -------------
 *          0   0       80-column mode, interlaced
 *          0   1       132-column mode, interlaced
 *          1   0       60Hz, non-interlaced
 *          1   1       50Hz, non-interlaced
 *
 * On p. 4-56, the DC011 Block Diagram shows 8 outputs labeled LBA0 through LBA7.  From p. 4-61:
 *
 *      Several of the LBAs are used as general purpose clocks in the VT100. LBA3 and LBA4 are used to generate
 *      timing for the keyboard. These signals satisfy the keyboard's requirement of two square-waves, one twice the
 *      frequency of the other, even though every 16th transition is delayed (the second stage of the horizontal
 *      counter divides by 17, not 16). LBA7 is used by the nonvolatile RAM.
 *
 * And on p. 4-62, timings are provided for the LBA0 through LBA7; in particular:
 *
 *      LBA6:   16.82353us (when LBA6 is low, for a period of 33.64706us)
 *      LBA7:   31.77778us (when LBA7 is high, for a period of 63.55556us)
 *
 * If we assume that the CPU cycle count increments once every 361.69ns, it will increment roughly 88 times every
 * time LBA7 toggles.  So we can divide the CPU cycle count by 88 and set LBA to the low bit of that truncated
 * result.  An even faster (but less accurate) solution would be to mask bit 6 of the CPU cycle count, which will
 * doesn't change until the count has been incremented 64 times.  See getLBA() for the chosen implementation.
 */
Chips.DC011 = {                 // generates Line Buffer Addresses (LBAs) for the Video Processor
    PORT:       0xC2,           // write-only
    COLS80:     0x00,
    COLS132:    0x10,
    RATE60:     0x20,
    RATE50:     0x30,
    INITCOLS:   0x00,           // ie, COLS80
    INITRATE:   0x20            // ie, RATE60
};

/*
 * DC012 is referred to as a Control Chip.
 *
 * As p. 4-67 (117) of the VT100 Technical Manual (July 1982) explains:
 *
 *      The DCO12 performs three main functions.
 *
 *       1. Scan count generation. This involves two counters, a multiplexer to switch between the counters,
 *          double-height logic, scroll and line attribute latches, and various logic controlling switching between
 *          the two counters. This is the biggest part of the chip. It includes all scrolling, double-height logic,
 *          and feeds into the underline and hold request circuits.
 *
 *       2. Generation of HOLD REQUEST. This uses information from the scan counters and the scrolling logic to
 *          decide when to generate HOLD REQUEST.
 *
 *       3. Video modifications: dot stretching, blanking, addition of attributes to video outputs, and multiple
 *          intensity levels.
 *
 *      The input decoder accepts a 4-bit command from the microprocessor when VID WR 2 L is asserted. Table 4-6-2
 *      lists the commands.
 *
 *      D3 D2 D1 D0     Function
 *      -- -- -- --     --------
 *      0  0  0  0      Load low order scroll latch = 00
 *      0  0  0  1      Load low order scroll latch = 01
 *      0  0  1  0      Load low order scroll latch = 10
 *      0  0  1  1      Load low order scroll latch = 11
 *
 *      0  1  0  0      Load high order scroll latch = 00
 *      0  1  0  1      Load high order scroll latch = 01
 *      0  1  1  0      Load high order scroll latch = 10
 *      0  1  1  1      Load high order scroll latch = 11 (not used)
 *
 *      1  0  0  0      Toggle blink flip-flop
 *      1  0  0  1      Clear vertical frequency interrupt
 *
 *      1  0  1  0      Set reverse field on
 *      1  0  1  1      Set reverse field off
 *
 *      1  1  0  0      Set basic attribute to underline*
 *      1  1  0  1      Set basic attribute to reverse video*
 *      1  1  1  0      Reserved for future specification*
 *      1  1  1  1      Reserved for future specification*
 *
 *      *These functions also clear blink flip-flop.
 */
Chips.DC012 = {                 // generates scan counts for the Video Processor
    PORT:       0xA2,           // write-only
    SCROLL_LO:  0x00,
    INITSCROLL: 0x00,
    INITBLINK:  0x00,
    INITREVERSE:0x00,
    INITATTR:   0x00
};

/*
 * ER1400 Non-Volatile RAM (NVR) Chip Definitions
 */
Chips.NVR = {
    LATCH: {
        PORT:   0x62            // write-only
    },
    CMD: {
        ACCEPT_DATA:    0x0,
        ACCEPT_ADDR:    0x1,
        SHIFT_OUT:      0x2,
        WRITE:          0x4,
        ERASE:          0x5,
        READ:           0x6,
        STANDBY:        0x7
    },
    WORDMASK:   0x3fff          // NVR words are 14-bit
    /*
     * The Technical Manual, p. 4-18, also notes that "Early VT100s can disable the receiver interrupt by
     * programming D4 in the NVR latch. However, this is never used by the VT100."
     */
};

Chips.LISTENERS = {
    0x42: [Chips.prototype.inFlags, Chips.prototype.outBrightness],
    0x62: [null, Chips.prototype.outNVRLatch],
    0xA2: [null, Chips.prototype.outDC012],
    0xC2: [null, Chips.prototype.outDC011]
};

Defs.CLASSES["Chips"] = Chips;

/**
 * @copyright https://www.pcjs.org/modules/devices/vt100/kbd.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ model: number }} */
var KeyboardConfig;

/**
 * @class {Keyboard}
 * @unrestricted
 * @property {KeyboardConfig} config
 */
class Keyboard extends Device {
    /**
     * Keyboard(idMachine, idDevice, config)
     *
     * @this {Keyboard}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {KeyboardConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.ports = /** @type {Ports} */ (this.findDeviceByClass("Ports"));
        for (let port in Keyboard.LISTENERS) {
            let listeners = Keyboard.LISTENERS[port];
            this.ports.addListener(+port, listeners[0], listeners[1], this);
        }
        /*
         * Whereas Keyboard.LEDS maps bits to device ID, this.leds maps bits to device *objects*.
         */
        this.leds = {};
        for (let bit in Keyboard.LEDS) {
            this.leds[bit] = /** @type {LED} */ (this.findDevice(Keyboard.LEDS[bit]));
        }
        this.input = /** @type {Input} */ (this.findDeviceByClass("Input"));
        this.input.addKeyMap(Keyboard.KEYMAP);
        this.onReset();
    }

    /**
     * onPower()
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Keyboard}
     */
    onPower()
    {
        if (!this.cpu) {
            this.cpu = /** @type {CPU} */ (this.findDeviceByClass("CPU"));
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Keyboard}
     */
    onReset()
    {
        this.bStatus = Keyboard.STATUS.INIT;
        this.bAddress = Keyboard.ADDRESS.INIT;
        this.fUARTBusy = false;
        this.nUARTSnap = 0;
        this.iKeyNext = -1;
    }

    /**
     * inUARTAddress(port)
     *
     * We take our cue from iKeyNext.  If it's -1 (default), we simply return the last value latched
     * in bAddress.  Otherwise, we call getActiveKey() to request the next mapped key value, latch it,
     * and increment iKeyNext.  Failing that, we latch ADDRESS.KEYLAST and reset iKeyNext to -1.
     *
     * @this {Keyboard}
     * @param {number} port (0x82)
     * @return {number} simulated port value
     */
    inUARTAddress(port)
    {
        let value = this.bAddress;
        if (this.iKeyNext >= 0) {
            let value = this.input.getActiveKey(this.iKeyNext, true);
            if (value) {
                this.iKeyNext++;
                if (value & 0x80) {
                    /*
                     * TODO: This code is supposed to be accompanied by a SHIFT key; make sure that it is.
                     */
                    value &= 0x7F;
                }
            } else {
                this.iKeyNext = -1;
                value = Keyboard.ADDRESS.KEYLAST;
            }
            this.bAddress = value;
            this.cpu.requestINTR(1);
        }
        this.printf(MESSAGE.PORTS + MESSAGE.KBD, "inUARTAddress(%#04x): %#04x\n", port, value);
        return value;
    }

    /**
     * outUARTStatus(port, value)
     *
     * @this {Keyboard}
     * @param {number} port (0x82)
     * @param {number} value
     */
    outUARTStatus(port, value)
    {
        this.printf(MESSAGE.PORTS + MESSAGE.KBD, "outUARTStatus(%#04x): %#04x\n", port, value);
        this.updateLEDs(value, this.bStatus);
        this.bStatus = value;
        this.fUARTBusy = true;
        this.nUARTSnap = this.time.getCycles();
        if (value & Keyboard.STATUS.START) {
            this.iKeyNext = 0;
            this.cpu.requestINTR(1);
        }
    }

    /**
     * updateLEDs(value, previous)
     *
     * @this {Keyboard}
     * @param {number} value
     * @param {number} previous
     */
    updateLEDs(value, previous)
    {
        let delta = value ^ previous;
        for (let bit in this.leds) {
            let led = this.leds[bit];
            if (!led) continue;
            if (delta & bit) {
                led.setLEDState(0, 0, (value & bit)? LED.STATE.ON : LED.STATE.OFF);
            }
        }
    }

    /**
     * loadState(state)
     *
     * Memory and Ports states are managed by the Bus onLoad() handler, which calls our loadState() handler.
     *
     * @this {Keyboard}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.bStatus = state.shift();
            this.bAddress = state.shift();
            this.fUARTBusy = state.shift();
            this.nUARTSnap = state.shift();
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * Memory and Ports states are managed by the Bus onSave() handler, which calls our saveState() handler.
     *
     * @this {Keyboard}
     * @param {Array} state
     */
    saveState(state)
    {
        state.push(this.idDevice);
        state.push(this.bStatus);
        state.push(this.bAddress);
        state.push(this.fUARTBusy);
        state.push(this.nUARTSnap);
    }
}

/*
 * Reading port 0x82 returns a key address from the VT100 keyboard's UART data output.
 *
 * Every time a keyboard scan is initiated (by setting the START bit of the status byte),
 * our internal address index (iKeyNext) is set to zero, and an interrupt is generated for
 * each entry in the aKeysActive array, along with a final interrupt for KEYLAST.
 */
Keyboard.ADDRESS = {
    PORT:       0x82,
    INIT:       0x7F,
    KEYLAST:    0x7F                // special end-of-scan key address (all valid key addresses are < KEYLAST)
};

/*
 * Writing port 0x82 updates the VT100's keyboard status byte via the keyboard's UART data input.
 */
Keyboard.STATUS = {
    PORT:       0x82,               // write-only
    LED4:       0x01,
    LED3:       0x02,
    LED2:       0x04,
    LED1:       0x08,
    LOCKED:     0x10,
    LOCAL:      0x20,
    LEDS:       0x3F,               // all LEDs
    START:      0x40,               // set to initiate a scan
    /*
     * From p. 4-38 of the VT100 Technical Manual (July 1982):
     *
     *      A bit (CLICK) in the keyboard status word controls the bell....  When a single status word contains
     *      the bell bit, flip-flop E3 toggles and turns on E1, generating a click. If the bell bit is set for
     *      many words in succession, the UART latch holds the data output constant..., allowing the circuit to
     *      produce an 800 hertz tone. Bell is generated by setting the bell bit for 0.25 seconds.  Each cycle of
     *      the tone is at a reduced amplitude compared with the single keyclick....  The overall effect of the
     *      tone burst on the ear is that of a beep.
     */
    CLICK:      0x80,
    INIT:       0x00
};

/*
 * Definitions of all VT100 keys (7-bit values representing key positions on the VT100).  These will be
 * used in a subsequent KEYMAP table.
 *
 * NOTE: The VT100 keyboard has both BACKSPACE and DELETE keys, whereas modern keyboards generally only
 * have DELETE.  And sadly, when you press DELETE, your modern keyboard and/or modern browser is reporting
 * it as keyCode 8: the code for BACKSPACE, aka CTRL-H.  You have to press a modified DELETE key to get
 * the actual DELETE keyCode of 127.
 *
 * We resolve this below by mapping KEYCODE.BS (8) to VT100 keyCode DELETE (0x03) and KEYCODE.DEL (127)
 * to VT100 keyCode BACKSPACE (0x33).  So, DELETE is BACKSPACE and BACKSPACE is DELETE.  Fortunately, this
 * confusion is all internal, because your physical key is (or should be) labeled DELETE, so the fact that
 * the browser is converting it to BACKSPACE and that we're converting BACKSPACE back into DELETE is
 * something most people don't need to worry their heads about.
 */
Keyboard.KEYCODE = {
    BS:         0x03,
    P:          0x05,
    O:          0x06,
    Y:          0x07,
    T:          0x08,
    W:          0x09,
    Q:          0x0A,
    RIGHT:      0x10,
    RBRACK:     0x14,
    LBRACK:     0x15,
    I:          0x16,
    U:          0x17,
    R:          0x18,
    E:          0x19,
    ONE:        0x1A,
    LEFT:       0x20,
    DOWN:       0x22,
    BREAK:      0x23,   // aka BREAK
    BQUOTE:     0x24,
    DASH:       0x25,
    NINE:       0x26,
    SEVEN:      0x27,
    FOUR:       0x28,
    THREE:      0x29,
    ESC:        0x2A,
    UP:         0x30,
    F3:         0x31,   // aka PF3
    F1:         0x32,   // aka PF1
    DEL:        0x33,
    EQUALS:     0x34,
    ZERO:       0x35,
    EIGHT:      0x36,
    SIX:        0x37,
    FIVE:       0x38,
    TWO:        0x39,
    TAB:        0x3A,
    NUM_7:      0x40,
    F4:         0x41,   // aka PF4
    F2:         0x42,   // aka PF2
    NUM_0:      0x43,
    LF:         0x44,   // aka LINE-FEED
    BSLASH:     0x45,
    L:          0x46,
    K:          0x47,
    G:          0x48,
    F:          0x49,
    A:          0x4A,
    NUM_8:      0x50,
    NUM_CR:     0x51,
    NUM_2:      0x52,
    NUM_1:      0x53,
    QUOTE:      0x55,
    SEMI:       0x56,
    J:          0x57,
    H:          0x58,
    D:          0x59,
    S:          0x5A,
    NUM_DEL:    0x60,   // aka KEYPAD PERIOD
    NUM_COMMA:  0x61,   // aka KEYPAD COMMA
    NUM_5:      0x62,
    NUM_4:      0x63,
    CR:         0x64,   // TODO: Figure out why the Technical Manual lists CR at both 0x04 and 0x64
    PERIOD:     0x65,
    COMMA:      0x66,
    N:          0x67,
    B:          0x68,
    X:          0x69,
    NO_SCROLL:  0x6A,   // aka NO-SCROLL
    NUM_9:      0x70,
    NUM_3:      0x71,
    NUM_6:      0x72,
    NUM_SUB:    0x73,   // aka KEYPAD MINUS
    SLASH:      0x75,
    M:          0x76,
    SPACE:      0x77,
    V:          0x78,
    C:          0x79,
    Z:          0x7A,
    SETUP:      0x7B,   // aka SET-UP
    CTRL:       0x7C,
    SHIFT:      0x7D,   // either shift key (doesn't matter)
    CAPS_LOCK:  0x7E
};

/*
 * Maps browser keyCodes to VT100 KEYCODE.
 */
Keyboard.KEYMAP = {
    [WebIO.KEYCODE.BS]:         Keyboard.KEYCODE.BS,
    [WebIO.KEYCODE.P]:          Keyboard.KEYCODE.P,
    [WebIO.KEYCODE.O]:          Keyboard.KEYCODE.O,
    [WebIO.KEYCODE.Y]:          Keyboard.KEYCODE.Y,
    [WebIO.KEYCODE.T]:          Keyboard.KEYCODE.T,
    [WebIO.KEYCODE.W]:          Keyboard.KEYCODE.W,
    [WebIO.KEYCODE.Q]:          Keyboard.KEYCODE.Q,
    [WebIO.KEYCODE.RIGHT]:      Keyboard.KEYCODE.RIGHT,
    [WebIO.KEYCODE.RBRACK]:     Keyboard.KEYCODE.RBRACK,
    [WebIO.KEYCODE.LBRACK]:     Keyboard.KEYCODE.LBRACK,
    [WebIO.KEYCODE.I]:          Keyboard.KEYCODE.I,
    [WebIO.KEYCODE.U]:          Keyboard.KEYCODE.U,
    [WebIO.KEYCODE.R]:          Keyboard.KEYCODE.R,
    [WebIO.KEYCODE.E]:          Keyboard.KEYCODE.E,
    [WebIO.KEYCODE.ONE]:        Keyboard.KEYCODE.ONE,
    [WebIO.KEYCODE.LEFT]:       Keyboard.KEYCODE.LEFT,
    [WebIO.KEYCODE.DOWN]:       Keyboard.KEYCODE.DOWN,
    [WebIO.KEYCODE.F6]:         Keyboard.KEYCODE.BREAK, // no natural mapping
    [WebIO.KEYCODE.BQUOTE]:     Keyboard.KEYCODE.BQUOTE,
    [WebIO.KEYCODE.DASH]:       Keyboard.KEYCODE.DASH,
    [WebIO.KEYCODE.NINE]:       Keyboard.KEYCODE.NINE,
    [WebIO.KEYCODE.SEVEN]:      Keyboard.KEYCODE.SEVEN,
    [WebIO.KEYCODE.FOUR]:       Keyboard.KEYCODE.FOUR,
    [WebIO.KEYCODE.THREE]:      Keyboard.KEYCODE.THREE,
    [WebIO.KEYCODE.ESC]:        Keyboard.KEYCODE.ESC,
    [WebIO.KEYCODE.UP]:         Keyboard.KEYCODE.UP,
    [WebIO.KEYCODE.F3]:         Keyboard.KEYCODE.F3,
    [WebIO.KEYCODE.F1]:         Keyboard.KEYCODE.F1,
    [WebIO.KEYCODE.DEL]:        Keyboard.KEYCODE.DEL,
    [WebIO.KEYCODE.EQUALS]:     Keyboard.KEYCODE.EQUALS,
    [WebIO.KEYCODE.ZERO]:       Keyboard.KEYCODE.ZERO,
    [WebIO.KEYCODE.EIGHT]:      Keyboard.KEYCODE.EIGHT,
    [WebIO.KEYCODE.SIX]:        Keyboard.KEYCODE.SIX,
    [WebIO.KEYCODE.FIVE]:       Keyboard.KEYCODE.FIVE,
    [WebIO.KEYCODE.TWO]:        Keyboard.KEYCODE.TWO,
    [WebIO.KEYCODE.TAB]:        Keyboard.KEYCODE.TAB,
    [WebIO.KEYCODE.NUM_7]:      Keyboard.KEYCODE.NUM_7,
    [WebIO.KEYCODE.F4]:         Keyboard.KEYCODE.F4,
    [WebIO.KEYCODE.F2]:         Keyboard.KEYCODE.F2,
    [WebIO.KEYCODE.NUM_0]:      Keyboard.KEYCODE.NUM_0,
    [WebIO.KEYCODE.F7]:         Keyboard.KEYCODE.LF,        // no natural mapping
    [WebIO.KEYCODE.BSLASH]:     Keyboard.KEYCODE.BSLASH,
    [WebIO.KEYCODE.L]:          Keyboard.KEYCODE.L,
    [WebIO.KEYCODE.K]:          Keyboard.KEYCODE.K,
    [WebIO.KEYCODE.G]:          Keyboard.KEYCODE.G,
    [WebIO.KEYCODE.F]:          Keyboard.KEYCODE.F,
    [WebIO.KEYCODE.A]:          Keyboard.KEYCODE.A,
    [WebIO.KEYCODE.NUM_8]:      Keyboard.KEYCODE.NUM_8,
    [WebIO.KEYCODE.CR]:         Keyboard.KEYCODE.NUM_CR,
    [WebIO.KEYCODE.NUM_2]:      Keyboard.KEYCODE.NUM_2,
    [WebIO.KEYCODE.NUM_1]:      Keyboard.KEYCODE.NUM_1,
    [WebIO.KEYCODE.QUOTE]:      Keyboard.KEYCODE.QUOTE,
    [WebIO.KEYCODE.SEMI]:       Keyboard.KEYCODE.SEMI,
    [WebIO.KEYCODE.J]:          Keyboard.KEYCODE.J,
    [WebIO.KEYCODE.H]:          Keyboard.KEYCODE.H,
    [WebIO.KEYCODE.D]:          Keyboard.KEYCODE.D,
    [WebIO.KEYCODE.S]:          Keyboard.KEYCODE.S,
    [WebIO.KEYCODE.NUM_DEL]:    Keyboard.KEYCODE.NUM_DEL,
    [WebIO.KEYCODE.F5]:         Keyboard.KEYCODE.NUM_COMMA, // no natural mapping
    [WebIO.KEYCODE.NUM_5]:      Keyboard.KEYCODE.NUM_5,
    [WebIO.KEYCODE.NUM_4]:      Keyboard.KEYCODE.NUM_4,
    [WebIO.KEYCODE.CR]:         Keyboard.KEYCODE.CR,
    [WebIO.KEYCODE.PERIOD]:     Keyboard.KEYCODE.PERIOD,
    [WebIO.KEYCODE.COMMA]:      Keyboard.KEYCODE.COMMA,
    [WebIO.KEYCODE.N]:          Keyboard.KEYCODE.N,
    [WebIO.KEYCODE.B]:          Keyboard.KEYCODE.B,
    [WebIO.KEYCODE.X]:          Keyboard.KEYCODE.X,
    [WebIO.KEYCODE.F8]:         Keyboard.KEYCODE.NO_SCROLL, // no natural mapping
    [WebIO.KEYCODE.NUM_9]:      Keyboard.KEYCODE.NUM_9,
    [WebIO.KEYCODE.NUM_3]:      Keyboard.KEYCODE.NUM_3,
    [WebIO.KEYCODE.NUM_6]:      Keyboard.KEYCODE.NUM_6,
    [WebIO.KEYCODE.NUM_SUB]:    Keyboard.KEYCODE.NUM_SUB,
    [WebIO.KEYCODE.SLASH]:      Keyboard.KEYCODE.SLASH,
    [WebIO.KEYCODE.M]:          Keyboard.KEYCODE.M,
    [WebIO.KEYCODE.SPACE]:      Keyboard.KEYCODE.SPACE,
    [WebIO.KEYCODE.V]:          Keyboard.KEYCODE.V,
    [WebIO.KEYCODE.C]:          Keyboard.KEYCODE.C,
    [WebIO.KEYCODE.Z]:          Keyboard.KEYCODE.Z,
    [WebIO.KEYCODE.F9]:         Keyboard.KEYCODE.SETUP,     // no natural mapping
    [WebIO.KEYCODE.CTRL]:       Keyboard.KEYCODE.CTRL,
    [WebIO.KEYCODE.SHIFT]:      Keyboard.KEYCODE.SHIFT,
    [WebIO.KEYCODE.CAPS_LOCK]:  Keyboard.KEYCODE.CAPS_LOCK
};

Keyboard.LEDS = {
    0x01:   "led4",
    0x02:   "led3",
    0x04:   "led2",
    0x08:   "led1",
    0x10:   "ledLocked",
    0x20:   "ledLocal"
};

Keyboard.LISTENERS = {
    0x82:   [Keyboard.prototype.inUARTAddress, Keyboard.prototype.outUARTStatus]
};

Defs.CLASSES["Keyboard"] = Keyboard;

/**
 * @copyright https://www.pcjs.org/modules/devices/vt100/serial.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {Serial}
 * @unrestricted
 */
class Serial extends Device {
    /**
     * Serial(idMachine, idDevice, config)
     *
     * @this {Serial}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        this.portBase = config['portBase'] || 0;
        this.nIRQ = config['irq'] || 2;

        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.ports = /** @type {Ports} */ (this.findDeviceByClass("Ports"));

        for (let port in Serial.LISTENERS) {
            let listeners = Serial.LISTENERS[port];
            this.ports.addListener(+port, listeners[0], listeners[1], this);
        }

        let serial = this;
        this.timerReceiveNext = this.time.addTimer(this.idDevice + ".receive", function() {
            serial.receiveData();
        });

        this.timerTransmitNext = this.time.addTimer(this.idDevice + ".transmit", function() {
            serial.transmitData();
        });

        /*
         * No connection until initConnection() is called.
         */
        // this.sDataReceived = "";
        this.connection = this.sendData = this.updateStatus = null;

        /*
         * Export all functions required by initConnection().
         */
        this['exports'] = {
            'connect': this.initConnection,
            'receiveData': this.receiveData,
            'receiveStatus': this.receiveStatus
        };
        this.onReset();
    }

    /**
     * initConnection(fNullModem)
     *
     * If a machine 'connection' parameter exists of the form "{sourcePort}->{targetMachine}.{targetPort}",
     * and "{sourcePort}" matches our idDevice, then look for a component with id "{targetMachine}.{targetPort}".
     *
     * If the target component is found, then verify that it has exported functions with the following names:
     *
     *      receiveData(data): called when we have data to transmit; aliased internally to sendData(data)
     *      receiveStatus(pins): called when our control signals have changed; aliased internally to updateStatus(pins)
     *
     * For now, we're not going to worry about communication in the other direction, because when the target component
     * performs its own initConnection(), it will find our receiveData() and receiveStatus() functions, at which point
     * communication in both directions should be established, and the circle of life complete.
     *
     * For added robustness, if the target machine initializes much more slowly than we do, and our connection attempt
     * fails, that's OK, because when it finally initializes, its initConnection() will call our initConnection();
     * if we've already initialized, no harm done.
     *
     * @this {Serial}
     * @param {boolean} [fNullModem] (caller's null-modem setting, to ensure our settings are in agreement)
     */
    initConnection(fNullModem)
    {
        if (!this.connection) {
            let sConnection = this.getMachineConfig("connection");
            if (sConnection) {
                let asParts = sConnection.split('->');
                if (asParts.length == 2) {
                    let sSourceID = asParts[0].trim();
                    if (sSourceID != this.idDevice) return;     // this connection string is intended for another instance
                    let sTargetID = asParts[1].trim();
                    this.connection = this.findDevice(sTargetID);
                    if (this.connection) {
                        let exports = this.connection['exports'];
                        if (exports) {
                            let fnConnect = /** @function */ (exports['connect']);
                            if (fnConnect) fnConnect.call(this.connection, this.fNullModem);
                            this.sendData = exports['receiveData'];
                            if (this.sendData) {
                                this.fNullModem = fNullModem;
                                this.updateStatus = exports['receiveStatus'];
                                this.printf("Connected %s.%s to %s\n", this.idMachine, sSourceID, sTargetID);
                                return;
                            }
                        }
                    }
                }
                /*
                 * Changed from notice() to status() because sometimes a connection fails simply because one of us is a laggard.
                 */
                this.printf("Unable to establish connection: %s\n", sConnection);
            }
        }
    }

    /**
     * onPower()
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Serial}
     */
    onPower()
    {
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {Serial}
     */
    onReset()
    {
        this.fReady = false;
        this.bDataIn = 0;
        this.bDataOut = 0;
        this.bStatus = Serial.UART8251.STATUS.INIT;
        this.bMode = Serial.UART8251.MODE.INIT;
        this.bCommand = Serial.UART8251.COMMAND.INIT;
        this.bBaudRates = Serial.UART8251.BAUDRATES.INIT;
    }

    /**
     * getBaudTimeout(maskRate)
     *
     * @this {Serial}
     * @param {number} maskRate (either SerialPort8080.UART8251.BAUDRATES.RECV_RATE or SerialPort8080.UART8251.BAUDRATES.XMIT_RATE)
     * @return {number} (number of milliseconds per byte)
     */
    getBaudTimeout(maskRate)
    {
        var indexRate = (this.bBaudRates & maskRate);
        if (!(maskRate & 0xf)) indexRate >>= 4;
        var nBaud = Serial.UART8251.BAUDTABLE[indexRate];
        var nBits = ((this.bMode & Serial.UART8251.MODE.DATA_BITS) >> 2) + 6;   // includes an extra +1 for start bit
        if (this.bMode & Serial.UART8251.MODE.PARITY_ENABLE) nBits++;
        nBits += ((((this.bMode & Serial.UART8251.MODE.STOP_BITS) >> 6) + 1) >> 1);
        var nBytesPerSecond = nBaud / nBits;
        return (1000 / nBytesPerSecond)|0;
    }

    /**
     * isTransmitterReady()
     *
     * Called when someone needs the UART's transmitter status.
     *
     * @this {Serial}
     * @return {boolean} (true if ready, false if not)
     */
    isTransmitterReady()
    {
        return !!(this.bStatus & Serial.UART8251.STATUS.XMIT_READY);
    }

    /**
     * receiveByte(b)
     *
     * @this {Serial}
     * @param {number} b
     * @return {boolean}
     */
    receiveByte(b)
    {
        this.printf(MESSAGE.SERIAL, "receiveByte(%#04x): status=%#04x\n", b, this.bStatus);
        if (!this.fAutoStop && !(this.bStatus & Serial.UART8251.STATUS.RECV_FULL)) {
            this.bDataIn = b;
            this.bStatus |= Serial.UART8251.STATUS.RECV_FULL;
            this.cpu.requestINTR(this.nIRQ);
            return true;
        }
        return false;
    }

    /**
     * receiveData(data)
     *
     * Helper for clocking received data at the expected RECV_RATE.
     *
     * When we're cramming test data down the terminal's throat, that data will typically be in the form
     * of a string.  When we're called by another component, data will typically be a number (ie, byte).  If no
     * data is specified at all, then all we do is "clock" any remaining data into the receiver.
     *
     * @this {Serial}
     * @param {number|string|undefined} [data]
     * @return {boolean} true if received, false if not
     */
    receiveData(data)
    {
        if (data != null) {
            if (typeof data != "number") {
                this.sDataReceived = data;
            } else {
                this.sDataReceived += String.fromCharCode(data);
            }
        }
        if (this.sDataReceived) {
            if (this.receiveByte(this.sDataReceived.charCodeAt(0))) {
                this.sDataReceived = this.sDataReceived.substr(1);
            }
            if (this.sDataReceived) {
                this.time.setTimer(this.timerReceiveNext, this.getBaudTimeout(Serial.UART8251.BAUDRATES.RECV_RATE));
            }
        }
        return true;                // for now, return true regardless, since we're buffering everything anyway
    }

    /**
     * receiveStatus(pins)
     *
     * NOTE: Prior to the addition of this interface, the DSR bit was initialized set and remained set for the life
     * of the machine.  It is entirely appropriate that this is the only way the bit can be changed, because it represents
     * an external control signal.
     *
     * @this {Serial}
     * @param {number} pins
     */
    receiveStatus(pins)
    {
        this.bStatus &= ~Serial.UART8251.STATUS.DSR;
        if (pins & RS232.DSR.MASK) this.bStatus |= Serial.UART8251.STATUS.DSR;
    }

    /**
     * transmitByte(b)
     *
     * @this {Serial}
     * @param {number} b
     * @return {boolean} true if transmitted, false if not
     */
    transmitByte(b)
    {
        let fTransmitted = false;
        this.printf(MESSAGE.SERIAL, "transmitByte(%#04x)\n", b);
        if (this.fAutoXOFF) {
            if (b == 0x13) {        // XOFF
                this.fAutoStop = true;
                return false;
            }
            if (b == 0x11) {        // XON
                this.fAutoStop = false;
                return false;
            }
        }
        if (this.sendData && this.sendData.call(this.connection, b)) {
            fTransmitted = true;
        }
        return fTransmitted;
    }

    /**
     * transmitData(sData)
     *
     * Helper for clocking transmitted data at the expected XMIT_RATE.
     *
     * When timerTransmitNext fires, we have honored the programmed XMIT_RATE period, so we can
     * set XMIT_READY (and XMIT_EMPTY), which signals the firmware that another byte can be transmitted.
     *
     * The sData parameter is not used when we're called via the timer; it's an optional parameter used by
     * the Keyboard component to deliver data pasted via the clipboard, and is currently only useful when
     * the SerialPort is connected to another machine.  TODO: Define a separate interface for that feature.
     *
     * @this {Serial}
     * @param {string} [sData]
     * @return {boolean} true if successful, false if not
     */
    transmitData(sData)
    {
        this.bStatus |= (Serial.UART8251.STATUS.XMIT_READY | Serial.UART8251.STATUS.XMIT_EMPTY);
        if (sData) {
            return this.sendData? this.sendData.call(this.connection, sData) : false;
        }
        return true;
    }

    /**
     * inData(port)
     *
     * @this {Serial}
     * @param {number} port (0x0)
     * @return {number} simulated port value
     */
    inData(port)
    {
        let value = this.bDataIn;
        this.printf(MESSAGE.PORTS + MESSAGE.SERIAL, "inData(%#04x): %#04x\n", port, value);
        this.bStatus &= ~Serial.UART8251.STATUS.RECV_FULL;
        return value;
    }

    /**
     * inStatus(port)
     *
     * @this {Serial}
     * @param {number} port (0x1)
     * @return {number} simulated port value
     */
    inStatus(port)
    {
        let value = this.bStatus;
        this.printf(MESSAGE.PORTS + MESSAGE.SERIAL, "inStatus(%#04x): %#04x\n", port, value);
        return value;
    }

    /**
     * outData(port, bOut)
     *
     * @this {Serial}
     * @param {number} port (0x0)
     * @param {number} value
     */
    outData(port, value)
    {
        this.printf(MESSAGE.PORTS + MESSAGE.SERIAL, "outData(%#04x): %#04x\n", port, value);
        this.bDataOut = value;
        this.bStatus &= ~(Serial.UART8251.STATUS.XMIT_READY | Serial.UART8251.STATUS.XMIT_EMPTY);
        /*
         * If we're transmitting to a virtual device that has no measurable delay, this code may clear XMIT_READY
         * too quickly:
         *
         *      if (this.transmitByte(bOut)) {
         *          this.bStatus |= (SerialPort8080.UART8251.STATUS.XMIT_READY | SerialPort8080.UART8251.STATUS.XMIT_EMPTY);
         *      }
         *
         * A better solution is to arm a timer based on the XMIT_RATE baud rate, and clear the above bits when that
         * timer fires.  Consequently, we no longer care what transmitByte() reports.
         */
        this.transmitByte(value);
        this.time.setTimer(this.timerTransmitNext, this.getBaudTimeout(Serial.UART8251.BAUDRATES.XMIT_RATE));
    }

    /**
     * outControl(port, value)
     *
     * Writes to the CONTROL port (0x1) are either MODE or COMMAND bytes.  If the device has just
     * been powered or reset, it is in a "not ready" state and is waiting for a MODE byte.  Once it
     * has received that initial byte, the device is marked "ready", and all further bytes are
     * interpreted as COMMAND bytes (until/unless a COMMAND byte with the INTERNAL_RESET bit is set).
     *
     * @this {Serial}
     * @param {number} port (0x1)
     * @param {number} value
     */
    outControl(port, value)
    {
        this.printf(MESSAGE.PORTS + MESSAGE.SERIAL, "outControl(%#04x): %#04x\n", port, value);
        if (!this.fReady) {
            this.bMode = value;
            this.fReady = true;
        } else {
            /*
             * Whenever DTR or RTS changes, we also want to notify any connected machine, via updateStatus().
             */
            if (this.updateStatus) {
                let delta = (value ^ this.bCommand);
                if (delta & (Serial.UART8251.COMMAND.RTS | Serial.UART8251.COMMAND.DTR)) {
                    let pins = 0;
                    if (this.fNullModem) {
                        pins |= (value & Serial.UART8251.COMMAND.RTS)? RS232.CTS.MASK : 0;
                        pins |= (value & Serial.UART8251.COMMAND.DTR)? (RS232.DSR.MASK | RS232.CD.MASK): 0;
                    } else {
                        pins |= (value & Serial.UART8251.COMMAND.RTS)? RS232.RTS.MASK : 0;
                        pins |= (value & Serial.UART8251.COMMAND.DTR)? RS232.DTR.MASK : 0;
                    }
                    this.updateStatus.call(this.connection, pins);
                }
            }
            this.bCommand = value;
            if (this.bCommand & Serial.UART8251.COMMAND.INTERNAL_RESET) {
                this.fReady = false;
            }
        }
    }

    /**
     * outBaudRates(port, value)
     *
     * @this {Serial}
     * @param {number} port (0x2)
     * @param {number} value
     */
    outBaudRates(port, value)
    {
        this.printf(MESSAGE.PORTS + MESSAGE.SERIAL, "outBaudRates(%#04x): %#04x\n", port, value);
        this.bBaudRates = value;
    }

    /**
     * loadState(state)
     *
     * Memory and Ports states are managed by the Bus onLoad() handler, which calls our loadState() handler.
     *
     * @this {Serial}
     * @param {Array} state
     * @return {boolean}
     */
    loadState(state)
    {
        let idDevice = state.shift();
        if (this.idDevice == idDevice) {
            this.fReady     = state.shift();
            this.bDataIn    = state.shift();
            this.bDataOut   = state.shift();
            this.bStatus    = state.shift();
            this.bMode      = state.shift();
            this.bCommand   = state.shift();
            this.bBaudRates = state.shift();
            return true;
        }
        return false;
    }

    /**
     * saveState(state)
     *
     * Memory and Ports states are managed by the Bus onSave() handler, which calls our saveState() handler.
     *
     * @this {Serial}
     * @param {Array} state
     */
    saveState(state)
    {
        state.push(this.idDevice);
        state.push(this.fReady);
        state.push(this.bDataIn);
        state.push(this.bDataOut);
        state.push(this.bStatus);
        state.push(this.bMode);
        state.push(this.bCommand);
        state.push(this.bBaudRates);
    }
}

Serial.UART8251 = {
    /*
     * Format of MODE byte written to CONTROL port 0x1
     */
    MODE: {
        BAUD_FACTOR:    0x03,       // 00=SYNC, 01=1x, 10=16x, 11=64x
        DATA_BITS:      0x0C,       // 00=5, 01=6, 10=7, 11=8
        PARITY_ENABLE:  0x10,
        EVEN_PARITY:    0x20,
        STOP_BITS:      0xC0,       // 00=invalid, 01=1, 10=1.5, 11=2
        INIT:           0x8E        // 16x baud rate, 8 data bits, no parity, 1.5 stop bits
    },
    /*
     * Format of COMMAND byte written to CONTROL port 0x1
     */
    COMMAND: {
        XMIT_ENABLE:    0x01,
        DTR:            0x02,       // Data Terminal Ready
        RECV_ENABLE:    0x04,
        SEND_BREAK:     0x08,
        ERROR_RESET:    0x10,
        RTS:            0x20,       // Request To Send
        INTERNAL_RESET: 0x40,
        HUNT_MODE:      0x80,
        INIT:           0x27        // XMIT_ENABLE | DTR | RECV_ENABLE | RTS
    },
    /*
     * Format of STATUS byte read from CONTROL port 0x1
     */
    STATUS: {
        XMIT_READY:     0x01,
        RECV_FULL:      0x02,
        XMIT_EMPTY:     0x04,
        PARITY_ERROR:   0x08,
        OVERRUN_ERROR:  0x10,
        FRAMING_ERROR:  0x20,
        BREAK_DETECT:   0x40,
        DSR:            0x80,       // Data Set Ready
        INIT:           0x85        // XMIT_READY | XMIT_EMPTY | DSR
    },
    /*
     * Format of BAUDRATES byte written to port 0x2
     *
     * Each nibble is an index (0x0-0xF) into a set of internal CPU clock divisors that yield the
     * following baud rates:
     *
     *      Index   Divisor     Baud Rate
     *      -----   -------     ---------
     *      0x0      3456       50
     *      0x1      2304       75
     *      0x2      1571       110
     *      0x3      1285       134.5
     *      0x4      1152       150
     *      0x5      864        200
     *      0x6      576        300
     *      0x7      288        600
     *      0x8      144        1200
     *      0x9      96         1800
     *      0xA      86         2000
     *      0xB      72         2400
     *      0xC      48         3600
     *      0xD      36         4800
     *      0xE      18         9600    (default)
     *      0xF      9          19200
     *
     * NOTE: This is a VT100-specific port and baud rate table.
     */
    BAUDRATES: {
        RECV_RATE:      0x0F,
        XMIT_RATE:      0xF0,
        INIT:           0xEE    // default to 9600 (0xE) for both XMIT and RECV
    },
    BAUDTABLE: [
        50, 75, 110, 134.5, 150, 200, 300, 600, 1200, 1800, 2000, 2400, 3600, 4800, 9600, 19200
    ]
};

Serial.LISTENERS = {
    0x0: [Serial.prototype.inData, Serial.prototype.outData],
    0x1: [Serial.prototype.inStatus, Serial.prototype.outControl],
    0x2: [null, Serial.prototype.outBaudRates]
};

Defs.CLASSES["Serial"] = Serial;

/**
 * @copyright https://www.pcjs.org/modules/devices/vt100/video.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ bufferWidth: number, bufferHeight: number, bufferAddr: number, bufferBits: number, bufferLeft: number, interruptRate: number }} */
var VideoConfig;

/**
 * @class {Video}
 * @unrestricted
 * @property {VideoConfig} config
 */
class Video extends Monitor {
    /**
     * Video(idMachine, idDevice, config)
     *
     * The Video component can be configured with the following config properties:
     *
     *      bufferWidth: the width of a single frame buffer row, in pixels (eg, 256)
     *      bufferHeight: the number of frame buffer rows (eg, 224)
     *      bufferAddr: the starting address of the frame buffer (eg, 0x2400)
     *      bufferRAM: true to use existing RAM (default is false)
     *      bufferBits: the number of bits per column (default is 1)
     *      bufferLeft: the bit position of the left-most pixel in a byte (default is 0; CGA uses 7)
     *      interruptRate: normally the same as (or some multiple of) refreshRate (eg, 120)
     *      refreshRate: how many times updateMonitor() should be performed per second (eg, 60)
     *
     *  In addition, if a text-only display is being emulated, define the following properties:
     *
     *      fontROM: URL of font ROM
     *      fontColor: default is white
     *      cellWidth: number (eg, 10 for VT100)
     *      cellHeight: number (eg, 10 for VT100)
     *
     * We record all the above values now, but we defer creation of the frame buffer until initBuffers()
     * is called.  At that point, we will also compute the extent of the frame buffer, determine the
     * appropriate "cell" size (ie, the number of pixels that updateMonitor() will fetch and process at once),
     * and then allocate our cell cache.
     *
     * Why interruptRate in addition to refreshRate?  A higher interrupt rate is required for Space Invaders,
     * because even though the CRT refreshes at 60Hz, the CRT controller interrupts the CPU *twice* per
     * refresh (once after the top half of the image has been redrawn, and again after the bottom half has
     * been redrawn), so we need an interrupt rate of 120Hz.  We pass the higher rate on to the CPU, so that
     * it will call updateMonitor() more frequently, but we still limit our monitor updates to every *other* call.
     *
     * @this {Video}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {ROMConfig} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        let video = this
        this.addrBuffer = config['bufferAddr'];
        this.fUseRAM = config['bufferRAM'];

        this.nColsBuffer = config['bufferWidth'];
        this.nRowsBuffer = config['bufferHeight'];

        this.cxCellDefault = this.cxCell = config['cellWidth'] || 1;
        this.cyCellDefault = this.cyCell = config['cellHeight'] || 1;

        this.abFontData = null;
        this.fDotStretcher = false;

        this.nBitsPerPixel = config['bufferBits'] || 1;
        this.iBitFirstPixel = config['bufferLeft'] || 0;

        this.rateInterrupt = config['interruptRate'];
        this.rateRefresh = config['refreshRate'] || 60;

        this.cxMonitorCell = (this.cxMonitor / this.nColsBuffer)|0;
        this.cyMonitorCell = (this.cyMonitor / this.nRowsBuffer)|0;

        /*
         * Now that we've finished using nRowsBuffer to help define the monitor size, we add one more
         * row for text modes, to account for the VT100's scroll line buffer (used for smooth scrolling).
         */
        if (this.cyCell > 1) {
            this.nRowsBuffer++;
            this.bScrollOffset = 0;
            this.fSkipSingleCellUpdate = false;
        }

        this.busMemory = /** @type {Bus} */ (this.findDevice(config['bus']));
        this.initBuffers();

        this.abFontData = config['fontROM'];
        this.createFonts();

        this.cpu = /** @type {CPU} */ (this.findDeviceByClass("CPU"));
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.timerUpdateNext = this.time.addTimer(this.idDevice, this.updateMonitor.bind(this));
        this.time.addUpdate(this.updateVideo.bind(this));

        this.time.setTimer(this.timerUpdateNext, this.getRefreshTime());
        this.nUpdates = 0;
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {Video}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        super.onPower(on);
        if (!this.cpu) {
            this.cpu = /** @type {CPU} */ (this.findDeviceByClass("CPU"));
        }
    }

    /**
     * initBuffers()
     *
     * @this {Video}
     * @return {boolean}
     */
    initBuffers()
    {
        /*
         * Allocate off-screen buffers now
         */
        this.cxBuffer = this.nColsBuffer * this.cxCell;
        this.cyBuffer = this.nRowsBuffer * this.cyCell;

        let cxBuffer = this.cxBuffer;
        let cyBuffer = this.cyBuffer;

        this.sizeBuffer = 0;
        if (!this.fUseRAM) {
            this.sizeBuffer = ((this.cxBuffer * this.nBitsPerPixel) >> 3) * this.cyBuffer;
            if (!this.busMemory.addBlocks(this.addrBuffer, this.sizeBuffer, Memory.TYPE.READWRITE)) {
                return false;
            }
        }

        /*
         * Since we will read video data from the bus at its default width, get that width now;
         * that width will also determine the size of a cell.
         */
        this.cellWidth = this.busMemory.dataWidth;

        /*
         * We add an extra column per row to store the visible line length at the start of every row.
         */
        this.initCache((this.nColsBuffer + 1) * this.nRowsBuffer);

        this.canvasBuffer = document.createElement("canvas");
        this.canvasBuffer.width = cxBuffer;
        this.canvasBuffer.height = cyBuffer;
        this.contextBuffer = this.canvasBuffer.getContext("2d");

        this.aFonts = {};
        this.initColors();

        /*
         * Beyond fonts, VT100 support requires that we maintain a number of additional properties:
         *
         *      rateMonitor: must be either 50 or 60 (defaults to 60); we don't emulate the monitor refresh rate,
         *      but we do need to keep track of which rate has been selected, because that affects the number of
         *      "fill lines" present at the top of the VT100's frame buffer: 2 lines for 60Hz, 5 lines for 50Hz.
         *
         *      The VT100 July 1982 Technical Manual, p. 4-89, shows the following sample frame buffer layout:
         *
         *                  00  01  02  03  04  05  06  07  08  09  0A  0B  0C  0D  0E  0F
         *                  --------------------------------------------------------------
         *          0x2000: 7F  70  03  7F  F2  D0  7F  70  06  7F  70  0C  7F  70  0F  7F
         *          0x2010: 70  03  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..
         *          ...
         *          0x22D0: 'D' 'A' 'T' 'A' ' ' 'F' 'O' 'R' ' ' 'F' 'I' 'R' 'S' 'T' ' ' 'L'
         *          0x22E0: 'I' 'N' 'E' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' '
         *          ...
         *          0x2320: 7F  F3  23  'D' 'A' 'T' 'A' ' ' 'F' 'O' 'R' ' ' 'S' 'E' 'C' 'O'
         *          0x2330: 'N' 'D' ' ' 'L' 'I' 'N' 'E' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' '
         *          ...
         *          0x2BE0: ' ' ' ' 'E' 'N' 'D' ' ' 'O' 'F' ' ' 'L' 'A' 'S' 'T' ' ' 'L' 'I'
         *          0x2BF0: 'N' 'E' 7F  70  06  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..  ..
         *          0x2C00: [AVO SCREEN RAM, IF ANY, BEGINS HERE]
         *
         *      ERRATA: The manual claims that if you change the byte at 0x2002 from 03 to 09, the number of "fill
         *      lines" will change from 2 to 5 (for 50Hz operation), but it shows 06 instead of 0C at location 0x200B;
         *      if you follow the links, it's pretty clear that byte has to be 0C to yield 5 "fill lines".  Since the
         *      address following the terminator at 0x2006 points to itself, it never makes sense for that terminator
         *      to be used EXCEPT at the end of the frame buffer.
         *
         *      As an alternative to tracking the monitor refresh rate, we could hard-code some knowledge about how
         *      the VT100's 8080 code uses memory, and simply ignore lines below address 0x22D0.  But the VT100 Video
         *      Processor makes no such assumption, and it would also break our test code in createFonts(), which
         *      builds a contiguous image of test data starting at the default frame buffer address (0x2000).
         */
        this.rateMonitor = 60;

        /*
         * The default character-selectable attribute (reverse video vs. underline) is controlled by fUnderline.
         */
        this.fUnderline = false;
        this.abLineBuffer = new Array(this.nColsBuffer);

        /*
         * Our 'smoothing' parameter defaults to null (which we treat the same as undefined), which means that
         * image smoothing will be selectively enabled (ie, true for text modes, false for graphics modes); otherwise,
         * we'll set image smoothing to whatever value was provided for ALL modes -- assuming the browser supports it.
         */
        if (this.sSmoothing) {
            this.contextMonitor[this.sSmoothing] = (this.fSmoothing == null? false : this.fSmoothing);
        }
        return true;
    }

    /**
     * createFonts()
     *
     * @this {Video}
     * @return {boolean}
     */
    createFonts()
    {
        /*
         * We retain abFontData in case we have to rebuild the fonts (eg, when we switch from 80 to 132 columns)
         */
        if (this.abFontData) {
            this.fDotStretcher = true;
            this.aFonts[Video.VT100.FONT.NORML] = [
                this.createFontVariation(this.cxCell, this.cyCell),
                this.createFontVariation(this.cxCell, this.cyCell, this.fUnderline)
            ];
            this.aFonts[Video.VT100.FONT.DWIDE] = [
                this.createFontVariation(this.cxCell*2, this.cyCell),
                this.createFontVariation(this.cxCell*2, this.cyCell, this.fUnderline)
            ];
            this.aFonts[Video.VT100.FONT.DHIGH] = this.aFonts[Video.VT100.FONT.DHIGH_BOT] = [
                this.createFontVariation(this.cxCell*2, this.cyCell*2),
                this.createFontVariation(this.cxCell*2, this.cyCell*2, this.fUnderline)
            ];
            return true;
        }
        return false;
    }

    /**
     * createFontVariation(cxCell, cyCell, fUnderline)
     *
     * This creates a 16x16 character grid for the requested font variation.  Variations include:
     *
     *      1) no variation (cell size is this.cxCell x this.cyCell)
     *      2) double-wide characters (cell size is this.cxCell*2 x this.cyCell)
     *      3) double-high double-wide characters (cell size is this.cxCell*2 x this.cyCell*2)
     *      4) any of the above with either reverse video or underline enabled (default is neither)
     *
     * @this {Video}
     * @param {number} cxCell is the target width of each character in the grid
     * @param {number} cyCell is the target height of each character in the grid
     * @param {boolean} [fUnderline] (null for unmodified font, false for reverse video, true for underline)
     * @return {Object}
     */
    createFontVariation(cxCell, cyCell, fUnderline)
    {
        /*
         * On a VT100, cxCell,cyCell is initially 10,10, but may change to 9,10 for 132-column mode.
         */



        /*
         * Create a font canvas that is both 16 times the target character width and the target character height,
         * ensuring that it will accommodate 16x16 characters (for a maximum of 256).  Note that the VT100 font ROM
         * defines only 128 characters, so that canvas will contain only 16x8 entries.
         */
        let nFontBytesPerChar = this.cxCellDefault <= 8? 8 : 16;
        let nFontByteOffset = nFontBytesPerChar > 8? 15 : 0;
        let nChars = this.abFontData.length / nFontBytesPerChar;

        /*
         * The absence of a boolean for fUnderline means that both fReverse and fUnderline are "falsey".  The presence
         * of a boolean means that fReverse will be true OR fUnderline will be true, but NOT both.
         */
        let fReverse = (fUnderline === false);

        let font = {cxCell: cxCell, cyCell: cyCell};
        font.canvas = document.createElement("canvas");
        font.canvas.width = cxCell * 16;
        font.canvas.height = cyCell * (nChars / 16);
        font.context = font.canvas.getContext("2d");

        let imageChar = font.context.createImageData(cxCell, cyCell);

        for (let iChar = 0; iChar < nChars; iChar++) {
            for (let y = 0, yDst = y; y < this.cyCell; y++) {
                let offFontData = iChar * nFontBytesPerChar + ((nFontByteOffset + y) & (nFontBytesPerChar - 1));
                let bits = (fUnderline && y == 8? 0xff : this.abFontData[offFontData]);
                for (let nRows = 0; nRows < (cyCell / this.cyCell); nRows++) {
                    let bitPrev = 0;
                    for (let x = 0, xDst = x; x < this.cxCell; x++) {
                        /*
                         * While x goes from 0 to cxCell-1, obviously we will run out of bits after x is 7;
                         * since the final bit must be replicated all the way to the right edge of the cell
                         * (so that line-drawing characters seamlessly connect), we ensure that the effective
                         * shift count remains stuck at 7 once it reaches 7.
                         */
                        let bitReal = bits & (0x80 >> (x > 7? 7 : x));
                        let bit = (this.fDotStretcher && !bitReal && bitPrev)? bitPrev : bitReal;
                        for (let nCols = 0; nCols < (cxCell / this.cxCell); nCols++) {
                            if (fReverse) bit = !bit;
                            this.setPixel(imageChar, xDst, yDst, bit? 1 : 0);
                            xDst++;
                        }
                        bitPrev = bitReal;
                    }
                    yDst++;
                }
            }
            /*
             * (iChar >> 4) performs the integer equivalent of Math.floor(iChar / 16), and (iChar & 0xf) is the equivalent of (iChar % 16).
             */
            font.context.putImageData(imageChar, (iChar & 0xf) * cxCell, (iChar >> 4) * cyCell);
        }
        return font;
    }

    /**
     * updateDimensions(nCols, nRows)
     *
     * Called from the Chip component whenever the monitor dimensions have been dynamically altered.
     *
     * @this {Video}
     * @param {number} nCols (should be either 80 or 132; 80 is the default)
     * @param {number} nRows (should be either 24 or 14; 24 is the default)
     */
    updateDimensions(nCols, nRows)
    {
        this.printf(MESSAGE.VIDEO, "updateDimensions(%d,%d)\n", nCols, nRows);
        this.nColsBuffer = nCols;
        /*
         * Even when the number of effective rows is 14 (or 15 counting the scroll line buffer), we want
         * to leave the number of rows at 24 (or 25 counting the scroll line buffer), because the VT100 doesn't
         * actually change character height (only character width).
         *
         *      this.nRowsBuffer = nRows+1; // +1 for scroll line buffer
         */
        this.cxCell = this.cxCellDefault;
        if (nCols > 80) this.cxCell--;      // VT100 font cells are 9x10 instead of 10x10 in 132-column mode
        if (this.initBuffers()) {
            this.createFonts();
        }
    }

    /**
     * updateRate(nRate)
     *
     * Called from the Chip component whenever the monitor refresh rate has been dynamically altered.
     *
     * @this {Video}
     * @param {number} nRate (should be either 50 or 60; 60 is the default)
     */
    updateRate(nRate)
    {
        this.printf(MESSAGE.VIDEO, "updateRate(%d)\n", nRate);
        this.rateMonitor = nRate;
    }

    /**
     * updateScrollOffset(bScroll)
     *
     * Called from the Chip component whenever the monitor scroll offset has been dynamically altered.
     *
     * @this {Video}
     * @param {number} bScroll
     */
    updateScrollOffset(bScroll)
    {
        this.printf(MESSAGE.VIDEO, "updateScrollOffset(%d)\n", bScroll);
        if (this.bScrollOffset !== bScroll) {
            this.bScrollOffset = bScroll;
            /*
             * WARNING: If we immediately redraw the monitor on the first wrap of the scroll offset back to zero,
             * we end up "slamming" the monitor's contents back down again, because it seems that the frame buffer
             * contents haven't actually been scrolled yet.  So we redraw now ONLY if bScroll is non-zero, lest
             * we ruin the smooth-scroll effect.
             *
             * And this change, while necessary, is not sufficient, because another intervening updateMonitor()
             * call could still occur before the frame buffer contents are actually scrolled; and ordinarily, if the
             * buffer hasn't changed, updateMonitor() would do nothing, but alas, if the cursor happens to get toggled
             * in the interim, updateMonitor() will want to update exactly ONE cell.
             *
             * So we deal with that by setting the fSkipSingleCellUpdate flag.  Now of course, there's no guarantee
             * that the next update of only ONE cell will always be a cursor update, but even if it isn't, skipping
             * that update doesn't seem like a huge cause for concern.
             */
            if (bScroll) {
                this.updateMonitor(true);
            } else {
                this.fSkipSingleCellUpdate = true;
            }
        }
    }

    /**
     * getRefreshTime()
     *
     * @this {Video}
     * @return {number} (number of milliseconds per refresh)
     */
    getRefreshTime()
    {
        return 1000 / Math.max(this.rateRefresh, this.rateInterrupt);
    }

    /**
     * initCache(nCells)
     *
     * Initializes the contents of our internal cell cache.
     *
     * @this {Video}
     * @param {number} [nCells]
     */
    initCache(nCells)
    {
        this.fCacheValid = false;
        if (nCells) {
            this.nCacheCells = nCells;
            if (this.aCacheCells === undefined || this.aCacheCells.length != this.nCacheCells) {
                this.aCacheCells = new Array(this.nCacheCells);
            }
        }
        /*
         * Because the VT100 frame buffer can be located anywhere in RAM (above 0x2000), we must defer this
         * test code until the powerUp() notification handler is called, when all RAM has (hopefully) been allocated.
         *
         * NOTE: The following test image was useful for early testing, but a *real* VT100 doesn't display a test image,
         * so this code is no longer enabled by default.  Remove MAXDEBUG if you want to see it again.
         */
        if (MAXDEBUG && !this.test) {
            /*
             * Build a test iamge in the VT100 frame buffer; we'll mimic the "SET-UP A" image, since it uses
             * all the font variations.  The process involves iterating over 0-based row numbers -2 (or -5 if 50Hz
             * operation is selected) through 24, checking aLineData for a matching row number, and converting the
             * corresponding string(s) to appropriate byte values.  Negative row numbers correspond to "fill lines"
             * and do not require a row entry.  If multiple strings are present for a given row, we invert the
             * default character attribute for subsequent strings.  An empty array ends the image build process.
             */
            let aLineData = {
                 0: [Video.VT100.FONT.DHIGH, 'SET-UP A'],
                 2: [Video.VT100.FONT.DWIDE, 'TO EXIT PRESS "SET-UP"'],
                22: [Video.VT100.FONT.NORML, '        T       T       T       T       T       T       T       T       T'],
                23: [Video.VT100.FONT.NORML, '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890', '1234567890'],
                24: []
            };
            let addr = this.addrBuffer;
            let addrNext = -1, font = -1;
            let b, nFill = (this.rateMonitor == 60? 2 : 5);
            for (let iRow = -nFill; iRow < this.nRowsBuffer; iRow++) {
                let lineData = aLineData[iRow];
                if (addrNext >= 0) {
                    let fBreak = false;
                    addrNext = addr + 2;
                    if (!lineData) {
                        if (font == Video.VT100.FONT.DHIGH) {
                            lineData = aLineData[iRow-1];
                            font = Video.VT100.FONT.DHIGH_BOT;
                        }
                    }
                    else {
                        if (lineData.length) {
                            font = lineData[0];
                        } else {
                            addrNext = addr - 1;
                            fBreak = true;
                        }
                    }
                    b = (font & Video.VT100.LINEATTR.FONTMASK) | ((addrNext >> 8) & Video.VT100.LINEATTR.ADDRMASK) | Video.VT100.LINEATTR.ADDRBIAS;
                    this.busMemory.writeData(addr++, b);
                    this.busMemory.writeData(addr++, addrNext & 0xff);
                    if (fBreak) break;
                }
                if (lineData) {
                    let attr = 0;
                    for (let j = 1; j < lineData.length; j++) {
                        let s = lineData[j];
                        for (let k = 0; k < s.length; k++) {
                            this.busMemory.writeData(addr++, s.charCodeAt(k) | attr);
                        }
                        attr ^= 0x80;
                    }
                }
                this.busMemory.writeData(addr++, Video.VT100.LINETERM);
                addrNext = addr;
            }
            this.test = true;
        }
    }

    /**
     * initColors()
     *
     * @this {Video}
     */
    initColors()
    {
        let rgbBlack  = [0x00, 0x00, 0x00, 0xff];
        let rgbWhite  = [0xff, 0xff, 0xff, 0xff];
        this.nColors = (1 << this.nBitsPerPixel);
        this.aRGB = new Array(this.nColors);
        this.aRGB[0] = rgbBlack;
        this.aRGB[1] = rgbWhite;
    }

    /**
     * setPixel(image, x, y, bPixel)
     *
     * @this {Video}
     * @param {Object} image
     * @param {number} x
     * @param {number} y
     * @param {number} bPixel (ie, an index into aRGB)
     */
    setPixel(image, x, y, bPixel)
    {
        let index = (x + y * image.width);
        let rgb = this.aRGB[bPixel];
        index *= rgb.length;
        image.data[index] = rgb[0];
        image.data[index+1] = rgb[1];
        image.data[index+2] = rgb[2];
        image.data[index+3] = rgb[3];
    }

    /**
     * updateChar(idFont, col, row, data, context)
     *
     * Updates a particular character cell (row,col) in the associated window.
     *
     * @this {Video}
     * @param {number} idFont
     * @param {number} col
     * @param {number} row
     * @param {number} data
     * @param {Object} [context]
     */
    updateChar(idFont, col, row, data, context)
    {
        let bChar = data & 0x7f;
        let font = this.aFonts[idFont][(data & 0x80)? 1 : 0];
        if (!font) return;

        let xSrc = (bChar & 0xf) * font.cxCell;
        let ySrc = (bChar >> 4) * font.cyCell;

        let xDst, yDst, cxDst, cyDst;

        let cxSrc = font.cxCell;
        let cySrc = font.cyCell;

        if (context) {
            xDst = col * this.cxCell;
            yDst = row * this.cyCell;
            cxDst = this.cxCell;
            cyDst = this.cyCell;
        } else {
            xDst = col * this.cxMonitorCell;
            yDst = row * this.cyMonitorCell;
            cxDst = this.cxMonitorCell;
            cyDst = this.cyMonitorCell;
        }

        /*
         * If font.cxCell > this.cxCell, then we assume the caller wants to draw a double-wide character,
         * so we will double xDst and cxDst.
         */
        if (font.cxCell > this.cxCell) {
            xDst *= 2;
            cxDst *= 2;

        }

        /*
         * If font.cyCell > this.cyCell, then we rely on idFont to indicate whether the top half or bottom half
         * of the character should be drawn.
         */
        if (font.cyCell > this.cyCell) {
            if (idFont == Video.VT100.FONT.DHIGH_BOT) ySrc += this.cyCell;
            cySrc = this.cyCell;

        }

        if (context) {
            context.drawImage(font.canvas, xSrc, ySrc, cxSrc, cySrc, xDst, yDst, cxDst, cyDst);
        } else {
            xDst += this.xMonitorOffset;
            yDst += this.yMonitorOffset;
            this.contextMonitor.drawImage(font.canvas, xSrc, ySrc, cxSrc, cySrc, xDst, yDst, cxDst, cyDst);
        }
    }

    /**
     * updateMonitor(fForced)
     *
     * Forced updates are generally internal updates triggered by an I/O operation or other state change,
     * while non-forced updates are periodic "refresh" updates.
     *
     * @this {Video}
     * @param {boolean} [fForced]
     */
    updateMonitor(fForced)
    {
        let fUpdate = true;
        if (!fForced) {
            /*
             * Since this is not a forced update, if our cell cache is valid AND we allocated our own buffer AND the buffer
             * is clean, then there's nothing to do.
             */
            if (fUpdate && this.fCacheValid && this.sizeBuffer) {
                if (this.busMemory.cleanBlocks(this.addrBuffer, this.sizeBuffer)) {
                    fUpdate = false;
                }
            }
            this.time.setTimer(this.timerUpdateNext, this.getRefreshTime());
            this.nUpdates++;
        }
        if (!fUpdate) {
            return;
        }
        this.updateScreen(fForced);
    }

    /**
     * updateScreen(f)
     *
     * Propagates the video buffer to the cell cache and updates the screen with any changes on the monitor.
     *
     * For every cell in the video buffer, compare it to the cell stored in the cell cache, render if it differs,
     * and then update the cell cache to match.  Since initCache() sets every cell in the cell cache to an
     * invalid value, we're assured that the next call to updateScreen() will redraw the entire (visible) video buffer.
     *
     * @this {Video}
     * @param {boolean} [fForced]
     */
    updateScreen(fForced)
    {
        let nRows = 0;
        let font, fontNext = -1;
        let nFill = (this.rateMonitor == 60? 2 : 5);
        let iCell = 0, cUpdated = 0, iCellUpdated = -1;

        let addrNext = this.addrBuffer;


        while (nRows < this.nRowsBuffer) {
            /*
             * Populate the line buffer
             */
            let nCols = 0;
            let addr = addrNext;
            let nColsVisible = this.nColsBuffer;
            font = fontNext;
            if (font != Video.VT100.FONT.NORML) nColsVisible >>= 1;
            while (true) {
                let data = this.busMemory.readData(addr++);
                if ((data & Video.VT100.LINETERM) == Video.VT100.LINETERM) {
                    let b = this.busMemory.readData(addr++);
                    fontNext = b & Video.VT100.LINEATTR.FONTMASK;
                    addrNext = ((b & Video.VT100.LINEATTR.ADDRMASK) << 8) | this.busMemory.readData(addr);
                    addrNext += (b & Video.VT100.LINEATTR.ADDRBIAS)? Video.VT100.ADDRBIAS_LO : Video.VT100.ADDRBIAS_HI;
                    break;
                }
                if (nCols < nColsVisible) {
                    this.abLineBuffer[nCols++] = data;
                } else {
                    break;                          // ideally, we would wait for a LINETERM byte, but it's not safe to loop without limit
                }
            }

            /*
             * Skip the first few "fill lines"
             */
            if (nFill) {
                nFill--;
                continue;
            }

            /*
             * Pad the line buffer as needed
             */
            while (nCols < this.abLineBuffer.length) {
                this.abLineBuffer[nCols++] = 0;     // character code 0 is a empty font character
            }

            /*
             * Display the line buffer; ordinarily, the font number would be valid after processing the "fill lines",
             * but if the buffer isn't initialized yet, those lines might be missing, so the font number might not be set.
             */
            if (font >= 0) {
                /*
                 * Cell cache logic is complicated by the fact that a line may be single-width one frame and double-width
                 * the next.  So we store the visible line length at the start of each row in the cache, which must match if
                 * the cache can be considered valid for the current line.
                 */
                let fLineCacheValid = this.fCacheValid && (this.aCacheCells[iCell] == nColsVisible);
                this.aCacheCells[iCell++] = nColsVisible;
                for (let iCol = 0; iCol < nCols; iCol++) {
                    let data = this.abLineBuffer[iCol];
                    if (!fLineCacheValid || data !== this.aCacheCells[iCell]) {
                        this.aCacheCells[iCellUpdated = iCell] = data;
                        this.updateChar(font, iCol, nRows, data, this.contextBuffer);
                        cUpdated++;
                    }
                    iCell++;
                }
            }
            nRows++;
        }
        this.fCacheValid = true;



        if (!fForced && this.fSkipSingleCellUpdate && cUpdated == 1) {
            /*
             * We're going to blow off this update, since it comes on the heels of a smooth-scroll that *may*
             * not be completely finished yet, and at the same time, we're going to zap the only updated cell
             * cache entry, to guarantee that it's redrawn on the next update.
             */

            /*
             * TODO: If I change the RECV rate to 19200 and enable smooth scrolling, I sometimes see a spurious
             * "H" on the bottom line after a long series of "HELLO WORLD!\r\n" tests.  Dumping video memory shows
             * "HELLO WORLD!" on 23 lines and an "H" on the 24th line, so it's really there.  But strangely, if
             * I then press SET-UP two times, the restored monitor does NOT have the spurious "H".  So somehow the
             * firmware knows what should and shouldn't be on-screen.
             *
             * Possible VT100 firmware bug?  I'm not sure.  Anyway, this DEBUG-only code is here to help trap
             * that scenario, until I figure it out.
             */
            if (DEBUG && (this.aCacheCells[iCellUpdated] & 0x7f) == 0x48) {
                this.printf("spurious 'H' character at offset %d\n", iCellUpdated);
            }
            this.aCacheCells[iCellUpdated] = -1;
            cUpdated = 0;
        }
        this.fSkipSingleCellUpdate = false;

        if ((cUpdated || fForced) && this.contextBuffer) {
            /*
             * We must subtract cyCell from cyBuffer to avoid displaying the extra "scroll line" that we normally
             * buffer, in support of smooth scrolling.  Speaking of which, we must also add bScrollOffset to ySrc
             * (well, ySrc is always relative to zero, so no add is actually required).
             */
            this.contextMonitor.drawImage(
                this.canvasBuffer,
                0,                                  // xSrc
                this.bScrollOffset,                 // ySrc
                this.cxBuffer,                      // cxSrc
                this.cyBuffer - this.cyCell,        // cySrc
                this.xMonitorOffset,                // xDst
                this.yMonitorOffset,                // yDst
                this.cxMonitorOffset,               // cxDst
                this.cyMonitorOffset                // cyDst
            );
        }
    }

    /**
     * updateVideo(fTransition)
     *
     * This is our obligatory update() function, which every device with visual components should have.
     *
     * For the Video device, our sole function is making sure the screen display is up-to-date.  However, calling
     * updateScreen() is a bad idea if the machine is running, because we already have a timer to take care of
     * that.  But we can also be called when the machine is NOT running (eg, the Debugger may be stepping through
     * some code, or editing the frame buffer directly, or something else).  Since we have no way of knowing, we
     * simply force an update.
     *
     * @this {Video}
     * @param {boolean} [fTransition]
     */
    updateVideo(fTransition)
    {
        if (!this.time.isRunning()) this.updateScreen();
    }
}

Video.VT100 = {
    /*
     * The following font IDs are nothing more than all the possible LINEATTR values masked with FONTMASK;
     * also, note that double-high implies double-wide; the VT100 doesn't support a double-high single-wide font.
     */
    FONT: {
        NORML:      0x60,       // normal font (eg, 10x10)
        DWIDE:      0x40,       // double-wide, single-high font (eg, 20x10)
        DHIGH:      0x20,       // technically, this means display only the TOP half of the double-high font (eg, 20x20)
        DHIGH_BOT:  0x00        // technically, this means display only the BOTTOM half of the double-high font (eg, 20x20)
    },
    LINETERM:       0x7F,
    LINEATTR: {
        ADDRMASK:   0x0F,
        ADDRBIAS:   0x10,       // 0x10 == ADDRBIAS_LO, 0x00 = ADDRBIAS_HI
        FONTMASK:   0x60,
        SCROLL:     0x80
    },
    ADDRBIAS_LO:    0x2000,
    ADDRBIAS_HI:    0x4000
};

Defs.CLASSES["Video"] = Video;

/**
 * @copyright https://www.pcjs.org/modules/devices/cpu/cpu8080.js (C) Jeff Parsons 2012-2019
 */

/**
 * Emulation of the 8080 CPU
 *
 * @class {CPU}
 * @unrestricted
 * @property {Input} input
 * @property {Time} time
 * @property {number} nCyclesClocked
 * @property {number} nCyclesTarget
 */
class CPU extends Device {
    /**
     * CPU(idMachine, idDevice, config)
     *
     * @this {CPU}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);

        /*
         * Initialize the CPU.
         */
        this.init();

        /*
         * This internal cycle count is initialized on every clock() invocation,
         * enabling opcode functions that need to consume a few extra cycles to bump this
         * count upward as needed.
         */
        this.nCyclesClocked = this.nCyclesTarget = 0;

        /*
         * Get access to the Input device, so we can call setFocus() as needed.
         */
        this.input = /** @type {Input} */ (this.findDeviceByClass("Input", false));

        /*
         * Get access to the Bus devices, so we have access to the I/O and memory address spaces.
         */
        this.busIO = /** @type {Bus} */ (this.findDevice(this.config['busIO']));
        this.busMemory = /** @type {Bus} */ (this.findDevice(this.config['busMemory']));

        /*
         * Get access to the Time device, so we can give it our clockCPU() and updateCPU() functions.
         */
        this.time = /** @type {Time} */ (this.findDeviceByClass("Time"));
        this.time.addClock(this.clockCPU.bind(this));
        this.time.addUpdate(this.updateCPU.bind(this));

        /*
         * If a Debugger is loaded, it will call connectDebugger().  Having access to the Debugger
         * allows our toString() function to include the instruction, via toInstruction(), and conversely,
         * the Debugger will enjoy access to all our defined register names.
         */
        this.dbg = undefined;

        this.defineRegister("A", () => this.regA, (value) => this.regA = value & 0xff);
        this.defineRegister("B", () => this.regB, (value) => this.regB = value & 0xff);
        this.defineRegister("C", () => this.regC, (value) => this.regC = value & 0xff);
        this.defineRegister("D", () => this.regD, (value) => this.regD = value & 0xff);
        this.defineRegister("E", () => this.regE, (value) => this.regE = value & 0xff);
        this.defineRegister("H", () => this.regH, (value) => this.regH = value & 0xff);
        this.defineRegister("L", () => this.regL, (value) => this.regL = value & 0xff);
        this.defineRegister("CF", () => (this.getCF()? 1 : 0), (value) => {value? this.setCF() : this.clearCF()});
        this.defineRegister("PF", () => (this.getPF()? 1 : 0), (value) => {value? this.setPF() : this.clearPF()});
        this.defineRegister("AF", () => (this.getAF()? 1 : 0), (value) => {value? this.setAF() : this.clearAF()});
        this.defineRegister("ZF", () => (this.getZF()? 1 : 0), (value) => {value? this.setZF() : this.clearZF()});
        this.defineRegister("SF", () => (this.getSF()? 1 : 0), (value) => {value? this.setSF() : this.clearSF()});
        this.defineRegister("IF", () => (this.getIF()? 1 : 0), (value) => {value? this.setIF() : this.clearIF()});
        this.defineRegister("BC", this.getBC, this.setBC);
        this.defineRegister("DE", this.getDE, this.setDE);
        this.defineRegister("HL", this.getHL, this.setHL);
        this.defineRegister(DbgIO.REGISTER.PC, this.getPC, this.setPC);
    }

    /**
     * connectDebugger(dbg)
     *
     * @param {DbgIO} dbg
     * @return {Object}
     */
    connectDebugger(dbg)
    {
        this.dbg = dbg;
        return this.registers;
    }

    /**
     * clockCPU(nCyclesTarget)
     *
     * @this {CPU}
     * @param {number} [nCyclesTarget] (default is 0 to single-step; -1 signals an abort)
     * @return {number} (number of cycles actually "clocked")
     */
    clockCPU(nCyclesTarget = 0)
    {
        if (nCyclesTarget < 0) {
            this.nCyclesTarget = 0;
            return 0;
        }
        try {
            this.execute(nCyclesTarget);
        } catch(err) {
            this.regPC = this.regPCLast;
            this.println(err.message);
            this.time.stop();
        }
        return this.nCyclesClocked;
    }

    /**
     * execute(nCycles)
     *
     * Executes the specified "burst" of instructions.  This code exists outside of the clockCPU() function
     * to ensure that its try/catch exception handler doesn't interfere with the optimization of this tight loop.
     *
     * @this {CPU}
     * @param {number} nCycles
     */
    execute(nCycles)
    {
        this.nCyclesClocked = 0;
        this.nCyclesTarget = nCycles;
        /*
         * If checkINTR() returns false, INTFLAG.HALT must be set, so no instructions should be executed.
         */
        if (!this.checkINTR()) return;
        while (this.nCyclesClocked <= this.nCyclesTarget) {
            this.regPCLast = this.regPC;
            this.aOps[this.getPCByte()].call(this);
        }
    }

    /**
     * init()
     *
     * Initializes the CPU's state.
     *
     * @this {CPU}
     */
    init()
    {
        this.resetRegs()

        /*
         * This 256-entry array of opcode functions is at the heart of the CPU engine.
         *
         * It might be worth trying a switch() statement instead, to see how the performance compares,
         * but I suspect that would vary quite a bit across JavaScript engines; for now, I'm putting my
         * money on array lookup.
         */
        this.aOps = [
            /* 0x00-0x03 */ this.opNOP,   this.opLXIB,  this.opSTAXB, this.opINXB,
            /* 0x04-0x07 */ this.opINRB,  this.opDCRB,  this.opMVIB,  this.opRLC,
            /* 0x08-0x0B */ this.opNOP,   this.opDADB,  this.opLDAXB, this.opDCXB,
            /* 0x0C-0x0F */ this.opINRC,  this.opDCRC,  this.opMVIC,  this.opRRC,
            /* 0x10-0x13 */ this.opNOP,   this.opLXID,  this.opSTAXD, this.opINXD,
            /* 0x14-0x17 */ this.opINRD,  this.opDCRD,  this.opMVID,  this.opRAL,
            /* 0x18-0x1B */ this.opNOP,   this.opDADD,  this.opLDAXD, this.opDCXD,
            /* 0x1C-0x1F */ this.opINRE,  this.opDCRE,  this.opMVIE,  this.opRAR,
            /* 0x20-0x23 */ this.opNOP,   this.opLXIH,  this.opSHLD,  this.opINXH,
            /* 0x24-0x27 */ this.opINRH,  this.opDCRH,  this.opMVIH,  this.opDAA,
            /* 0x28-0x2B */ this.opNOP,   this.opDADH,  this.opLHLD,  this.opDCXH,
            /* 0x2C-0x2F */ this.opINRL,  this.opDCRL,  this.opMVIL,  this.opCMA,
            /* 0x30-0x33 */ this.opNOP,   this.opLXISP, this.opSTA,   this.opINXSP,
            /* 0x34-0x37 */ this.opINRM,  this.opDCRM,  this.opMVIM,  this.opSTC,
            /* 0x38-0x3B */ this.opNOP,   this.opDADSP, this.opLDA,   this.opDCXSP,
            /* 0x3C-0x3F */ this.opINRA,  this.opDCRA,  this.opMVIA,  this.opCMC,
            /* 0x40-0x43 */ this.opMOVBB, this.opMOVBC, this.opMOVBD, this.opMOVBE,
            /* 0x44-0x47 */ this.opMOVBH, this.opMOVBL, this.opMOVBM, this.opMOVBA,
            /* 0x48-0x4B */ this.opMOVCB, this.opMOVCC, this.opMOVCD, this.opMOVCE,
            /* 0x4C-0x4F */ this.opMOVCH, this.opMOVCL, this.opMOVCM, this.opMOVCA,
            /* 0x50-0x53 */ this.opMOVDB, this.opMOVDC, this.opMOVDD, this.opMOVDE,
            /* 0x54-0x57 */ this.opMOVDH, this.opMOVDL, this.opMOVDM, this.opMOVDA,
            /* 0x58-0x5B */ this.opMOVEB, this.opMOVEC, this.opMOVED, this.opMOVEE,
            /* 0x5C-0x5F */ this.opMOVEH, this.opMOVEL, this.opMOVEM, this.opMOVEA,
            /* 0x60-0x63 */ this.opMOVHB, this.opMOVHC, this.opMOVHD, this.opMOVHE,
            /* 0x64-0x67 */ this.opMOVHH, this.opMOVHL, this.opMOVHM, this.opMOVHA,
            /* 0x68-0x6B */ this.opMOVLB, this.opMOVLC, this.opMOVLD, this.opMOVLE,
            /* 0x6C-0x6F */ this.opMOVLH, this.opMOVLL, this.opMOVLM, this.opMOVLA,
            /* 0x70-0x73 */ this.opMOVMB, this.opMOVMC, this.opMOVMD, this.opMOVME,
            /* 0x74-0x77 */ this.opMOVMH, this.opMOVML, this.opHLT,   this.opMOVMA,
            /* 0x78-0x7B */ this.opMOVAB, this.opMOVAC, this.opMOVAD, this.opMOVAE,
            /* 0x7C-0x7F */ this.opMOVAH, this.opMOVAL, this.opMOVAM, this.opMOVAA,
            /* 0x80-0x83 */ this.opADDB,  this.opADDC,  this.opADDD,  this.opADDE,
            /* 0x84-0x87 */ this.opADDH,  this.opADDL,  this.opADDM,  this.opADDA,
            /* 0x88-0x8B */ this.opADCB,  this.opADCC,  this.opADCD,  this.opADCE,
            /* 0x8C-0x8F */ this.opADCH,  this.opADCL,  this.opADCM,  this.opADCA,
            /* 0x90-0x93 */ this.opSUBB,  this.opSUBC,  this.opSUBD,  this.opSUBE,
            /* 0x94-0x97 */ this.opSUBH,  this.opSUBL,  this.opSUBM,  this.opSUBA,
            /* 0x98-0x9B */ this.opSBBB,  this.opSBBC,  this.opSBBD,  this.opSBBE,
            /* 0x9C-0x9F */ this.opSBBH,  this.opSBBL,  this.opSBBM,  this.opSBBA,
            /* 0xA0-0xA3 */ this.opANAB,  this.opANAC,  this.opANAD,  this.opANAE,
            /* 0xA4-0xA7 */ this.opANAH,  this.opANAL,  this.opANAM,  this.opANAA,
            /* 0xA8-0xAB */ this.opXRAB,  this.opXRAC,  this.opXRAD,  this.opXRAE,
            /* 0xAC-0xAF */ this.opXRAH,  this.opXRAL,  this.opXRAM,  this.opXRAA,
            /* 0xB0-0xB3 */ this.opORAB,  this.opORAC,  this.opORAD,  this.opORAE,
            /* 0xB4-0xB7 */ this.opORAH,  this.opORAL,  this.opORAM,  this.opORAA,
            /* 0xB8-0xBB */ this.opCMPB,  this.opCMPC,  this.opCMPD,  this.opCMPE,
            /* 0xBC-0xBF */ this.opCMPH,  this.opCMPL,  this.opCMPM,  this.opCMPA,
            /* 0xC0-0xC3 */ this.opRNZ,   this.opPOPB,  this.opJNZ,   this.opJMP,
            /* 0xC4-0xC7 */ this.opCNZ,   this.opPUSHB, this.opADI,   this.opRST0,
            /* 0xC8-0xCB */ this.opRZ,    this.opRET,   this.opJZ,    this.opJMP,
            /* 0xCC-0xCF */ this.opCZ,    this.opCALL,  this.opACI,   this.opRST1,
            /* 0xD0-0xD3 */ this.opRNC,   this.opPOPD,  this.opJNC,   this.opOUT,
            /* 0xD4-0xD7 */ this.opCNC,   this.opPUSHD, this.opSUI,   this.opRST2,
            /* 0xD8-0xDB */ this.opRC,    this.opRET,   this.opJC,    this.opIN,
            /* 0xDC-0xDF */ this.opCC,    this.opCALL,  this.opSBI,   this.opRST3,
            /* 0xE0-0xE3 */ this.opRPO,   this.opPOPH,  this.opJPO,   this.opXTHL,
            /* 0xE4-0xE7 */ this.opCPO,   this.opPUSHH, this.opANI,   this.opRST4,
            /* 0xE8-0xEB */ this.opRPE,   this.opPCHL,  this.opJPE,   this.opXCHG,
            /* 0xEC-0xEF */ this.opCPE,   this.opCALL,  this.opXRI,   this.opRST5,
            /* 0xF0-0xF3 */ this.opRP,    this.opPOPSW, this.opJP,    this.opDI,
            /* 0xF4-0xF7 */ this.opCP,    this.opPUPSW, this.opORI,   this.opRST6,
            /* 0xF8-0xFB */ this.opRM,    this.opSPHL,  this.opJM,    this.opEI,
            /* 0xFC-0xFF */ this.opCM,    this.opCALL,  this.opCPI,   this.opRST7
        ];
    }

    /**
     * loadState(stateCPU)
     *
     * If any saved values don't match (possibly overridden), abandon the given state and return false.
     *
     * @this {CPU}
     * @param {Array} stateCPU
     * @return {boolean}
     */
    loadState(stateCPU)
    {
        if (!stateCPU || !stateCPU.length) {
            this.println("invalid saved state");
            return false;
        }
        let idDevice = stateCPU.shift();
        let version = stateCPU.shift();
        if (idDevice != this.idDevice || (version|0) !== (+VERSION|0)) {
            this.printf("CPU state mismatch (%s %3.2f)\n", idDevice, version);
            return false;
        }
        try {
            this.regA = stateCPU.shift();
            this.regB = stateCPU.shift();
            this.regC = stateCPU.shift();
            this.regD = stateCPU.shift();
            this.regE = stateCPU.shift();
            this.regH = stateCPU.shift();
            this.regL = stateCPU.shift();
            this.setPC(stateCPU.shift());
            this.setSP(stateCPU.shift());
            this.setPS(stateCPU.shift());
            this.intFlags = stateCPU.shift();
        } catch(err) {
            this.println("CPU state error: " + err.message);
            return false;
        }
        return true;
    }

    /**
     * saveState(stateCPU)
     *
     * @this {CPU}
     * @param {Array} stateCPU
     */
    saveState(stateCPU)
    {
        stateCPU.push(this.idDevice);
        stateCPU.push(+VERSION);
        stateCPU.push(this.regA);
        stateCPU.push(this.regB);
        stateCPU.push(this.regC);
        stateCPU.push(this.regD);
        stateCPU.push(this.regE);
        stateCPU.push(this.regH);
        stateCPU.push(this.regL);
        stateCPU.push(this.getPC());
        stateCPU.push(this.getSP());
        stateCPU.push(this.getPS());
        stateCPU.push(this.intFlags);
    }

    /**
     * onLoad(state)
     *
     * Automatically called by the Machine device if the machine's 'autoSave' property is true.
     *
     * @this {CPU}
     * @param {Array} state
     * @return {boolean}
     */
    onLoad(state)
    {
        if (state) {
            let stateCPU = state[0];
            if (this.loadState(stateCPU)) {
                state.shift();
                return true;
            }
        }
        return false;
    }

    /**
     * onPower(on)
     *
     * Called by the Machine device to provide notification of a power event.
     *
     * @this {CPU}
     * @param {boolean} on (true to power on, false to power off)
     */
    onPower(on)
    {
        if (on) {
            this.time.start();
            if (this.input) this.input.setFocus();
        } else {
            this.time.stop();
        }
    }

    /**
     * onReset()
     *
     * Called by the Machine device to provide notification of a reset event.
     *
     * @this {CPU}
     */
    onReset()
    {
        this.println("reset");
        this.resetRegs();
        if (!this.time.isRunning()) this.print(this.toString());
    }

    /**
     * onSave(state)
     *
     * Automatically called by the Machine device before all other devices have been powered down (eg, during
     * a page unload event).
     *
     * @this {CPU}
     * @param {Array} state
     */
    onSave(state)
    {
        let stateCPU = [];
        this.saveState(stateCPU);
        state.push(stateCPU);
    }

    /**
     * op=0x00 (NOP)
     *
     * @this {CPU}
     */
    opNOP()
    {
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x01 (LXI B,d16)
     *
     * @this {CPU}
     */
    opLXIB()
    {
        this.setBC(this.getPCWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x02 (STAX B)
     *
     * @this {CPU}
     */
    opSTAXB()
    {
        this.setByte(this.getBC(), this.regA);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x03 (INX B)
     *
     * @this {CPU}
     */
    opINXB()
    {
        this.setBC(this.getBC() + 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x04 (INR B)
     *
     * @this {CPU}
     */
    opINRB()
    {
        this.regB = this.incByte(this.regB);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x05 (DCR B)
     *
     * @this {CPU}
     */
    opDCRB()
    {
        this.regB = this.decByte(this.regB);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x06 (MVI B,d8)
     *
     * @this {CPU}
     */
    opMVIB()
    {
        this.regB = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x07 (RLC)
     *
     * @this {CPU}
     */
    opRLC()
    {
        let carry = this.regA << 1;
        this.regA = (carry & 0xff) | (carry >> 8);
        this.updateCF(carry & 0x100);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x09 (DAD B)
     *
     * @this {CPU}
     */
    opDADB()
    {
        let w;
        this.setHL(w = this.getHL() + this.getBC());
        this.updateCF((w >> 8) & 0x100);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x0A (LDAX B)
     *
     * @this {CPU}
     */
    opLDAXB()
    {
        this.regA = this.getByte(this.getBC());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x0B (DCX B)
     *
     * @this {CPU}
     */
    opDCXB()
    {
        this.setBC(this.getBC() - 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x0C (INR C)
     *
     * @this {CPU}
     */
    opINRC()
    {
        this.regC = this.incByte(this.regC);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x0D (DCR C)
     *
     * @this {CPU}
     */
    opDCRC()
    {
        this.regC = this.decByte(this.regC);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x0E (MVI C,d8)
     *
     * @this {CPU}
     */
    opMVIC()
    {
        this.regC = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x0F (RRC)
     *
     * @this {CPU}
     */
    opRRC()
    {
        let carry = (this.regA << 8) & 0x100;
        this.regA = (carry | this.regA) >> 1;
        this.updateCF(carry);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x11 (LXI D,d16)
     *
     * @this {CPU}
     */
    opLXID()
    {
        this.setDE(this.getPCWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x12 (STAX D)
     *
     * @this {CPU}
     */
    opSTAXD()
    {
        this.setByte(this.getDE(), this.regA);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x13 (INX D)
     *
     * @this {CPU}
     */
    opINXD()
    {
        this.setDE(this.getDE() + 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x14 (INR D)
     *
     * @this {CPU}
     */
    opINRD()
    {
        this.regD = this.incByte(this.regD);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x15 (DCR D)
     *
     * @this {CPU}
     */
    opDCRD()
    {
        this.regD = this.decByte(this.regD);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x16 (MVI D,d8)
     *
     * @this {CPU}
     */
    opMVID()
    {
        this.regD = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x17 (RAL)
     *
     * @this {CPU}
     */
    opRAL()
    {
        let carry = this.regA << 1;
        this.regA = (carry & 0xff) | this.getCF();
        this.updateCF(carry & 0x100);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x19 (DAD D)
     *
     * @this {CPU}
     */
    opDADD()
    {
        let w;
        this.setHL(w = this.getHL() + this.getDE());
        this.updateCF((w >> 8) & 0x100);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x1A (LDAX D)
     *
     * @this {CPU}
     */
    opLDAXD()
    {
        this.regA = this.getByte(this.getDE());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x1B (DCX D)
     *
     * @this {CPU}
     */
    opDCXD()
    {
        this.setDE(this.getDE() - 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x1C (INR E)
     *
     * @this {CPU}
     */
    opINRE()
    {
        this.regE = this.incByte(this.regE);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x1D (DCR E)
     *
     * @this {CPU}
     */
    opDCRE()
    {
        this.regE = this.decByte(this.regE);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x1E (MVI E,d8)
     *
     * @this {CPU}
     */
    opMVIE()
    {
        this.regE = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x1F (RAR)
     *
     * @this {CPU}
     */
    opRAR()
    {
        let carry = (this.regA << 8);
        this.regA = ((this.getCF() << 8) | this.regA) >> 1;
        this.updateCF(carry & 0x100);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x21 (LXI H,d16)
     *
     * @this {CPU}
     */
    opLXIH()
    {
        this.setHL(this.getPCWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x22 (SHLD a16)
     *
     * @this {CPU}
     */
    opSHLD()
    {
        this.setWord(this.getPCWord(), this.getHL());
        this.nCyclesClocked += 16;
    }

    /**
     * op=0x23 (INX H)
     *
     * @this {CPU}
     */
    opINXH()
    {
        this.setHL(this.getHL() + 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x24 (INR H)
     *
     * @this {CPU}
     */
    opINRH()
    {
        this.regH = this.incByte(this.regH);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x25 (DCR H)
     *
     * @this {CPU}
     */
    opDCRH()
    {
        this.regH = this.decByte(this.regH);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x26 (MVI H,d8)
     *
     * @this {CPU}
     */
    opMVIH()
    {
        this.regH = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x27 (DAA)
     *
     * @this {CPU}
     */
    opDAA()
    {
        let src = 0;
        let CF = this.getCF();
        let AF = this.getAF();
        if (AF || (this.regA & 0x0F) > 9) {
            src |= 0x06;
        }
        if (CF || this.regA >= 0x9A) {
            src |= 0x60;
            CF = CPU.PS.CF;
        }
        this.regA = this.addByte(src);
        this.updateCF(CF? 0x100 : 0);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x29 (DAD H)
     *
     * @this {CPU}
     */
    opDADH()
    {
        let w;
        this.setHL(w = this.getHL() + this.getHL());
        this.updateCF((w >> 8) & 0x100);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x2A (LHLD a16)
     *
     * @this {CPU}
     */
    opLHLD()
    {
        this.setHL(this.getWord(this.getPCWord()));
        this.nCyclesClocked += 16;
    }

    /**
     * op=0x2B (DCX H)
     *
     * @this {CPU}
     */
    opDCXH()
    {
        this.setHL(this.getHL() - 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x2C (INR L)
     *
     * @this {CPU}
     */
    opINRL()
    {
        this.regL = this.incByte(this.regL);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x2D (DCR L)
     *
     * @this {CPU}
     */
    opDCRL()
    {
        this.regL = this.decByte(this.regL);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x2E (MVI L,d8)
     *
     * @this {CPU}
     */
    opMVIL()
    {
        this.regL = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x2F (CMA)
     *
     * @this {CPU}
     */
    opCMA()
    {
        this.regA = ~this.regA & 0xff;
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x31 (LXI SP,d16)
     *
     * @this {CPU}
     */
    opLXISP()
    {
        this.setSP(this.getPCWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x32 (STA a16)
     *
     * @this {CPU}
     */
    opSTA()
    {
        this.setByte(this.getPCWord(), this.regA);
        this.nCyclesClocked += 13;
    }

    /**
     * op=0x33 (INX SP)
     *
     * @this {CPU}
     */
    opINXSP()
    {
        this.setSP(this.getSP() + 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x34 (INR M)
     *
     * @this {CPU}
     */
    opINRM()
    {
        let addr = this.getHL();
        this.setByte(addr, this.incByte(this.getByte(addr)));
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x35 (DCR M)
     *
     * @this {CPU}
     */
    opDCRM()
    {
        let addr = this.getHL();
        this.setByte(addr, this.decByte(this.getByte(addr)));
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x36 (MVI M,d8)
     *
     * @this {CPU}
     */
    opMVIM()
    {
        this.setByte(this.getHL(), this.getPCByte());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x37 (STC)
     *
     * @this {CPU}
     */
    opSTC()
    {
        this.setCF();
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x39 (DAD SP)
     *
     * @this {CPU}
     */
    opDADSP()
    {
        let w;
        this.setHL(w = this.getHL() + this.getSP());
        this.updateCF((w >> 8) & 0x100);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0x3A (LDA a16)
     *
     * @this {CPU}
     */
    opLDA()
    {
        this.regA = this.getByte(this.getPCWord());
        this.nCyclesClocked += 13;
    }

    /**
     * op=0x3B (DCX SP)
     *
     * @this {CPU}
     */
    opDCXSP()
    {
        this.setSP(this.getSP() - 1);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x3C (INR A)
     *
     * @this {CPU}
     */
    opINRA()
    {
        this.regA = this.incByte(this.regA);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x3D (DCR A)
     *
     * @this {CPU}
     */
    opDCRA()
    {
        this.regA = this.decByte(this.regA);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x3E (MVI A,d8)
     *
     * @this {CPU}
     */
    opMVIA()
    {
        this.regA = this.getPCByte();
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x3F (CMC)
     *
     * @this {CPU}
     */
    opCMC()
    {
        this.updateCF(this.getCF()? 0 : 0x100);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x40 (MOV B,B)
     *
     * @this {CPU}
     */
    opMOVBB()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x41 (MOV B,C)
     *
     * @this {CPU}
     */
    opMOVBC()
    {
        this.regB = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x42 (MOV B,D)
     *
     * @this {CPU}
     */
    opMOVBD()
    {
        this.regB = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x43 (MOV B,E)
     *
     * @this {CPU}
     */
    opMOVBE()
    {
        this.regB = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x44 (MOV B,H)
     *
     * @this {CPU}
     */
    opMOVBH()
    {
        this.regB = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x45 (MOV B,L)
     *
     * @this {CPU}
     */
    opMOVBL()
    {
        this.regB = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x46 (MOV B,M)
     *
     * @this {CPU}
     */
    opMOVBM()
    {
        this.regB = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x47 (MOV B,A)
     *
     * @this {CPU}
     */
    opMOVBA()
    {
        this.regB = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x48 (MOV C,B)
     *
     * @this {CPU}
     */
    opMOVCB()
    {
        this.regC = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x49 (MOV C,C)
     *
     * @this {CPU}
     */
    opMOVCC()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x4A (MOV C,D)
     *
     * @this {CPU}
     */
    opMOVCD()
    {
        this.regC = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x4B (MOV C,E)
     *
     * @this {CPU}
     */
    opMOVCE()
    {
        this.regC = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x4C (MOV C,H)
     *
     * @this {CPU}
     */
    opMOVCH()
    {
        this.regC = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x4D (MOV C,L)
     *
     * @this {CPU}
     */
    opMOVCL()
    {
        this.regC = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x4E (MOV C,M)
     *
     * @this {CPU}
     */
    opMOVCM()
    {
        this.regC = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x4F (MOV C,A)
     *
     * @this {CPU}
     */
    opMOVCA()
    {
        this.regC = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x50 (MOV D,B)
     *
     * @this {CPU}
     */
    opMOVDB()
    {
        this.regD = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x51 (MOV D,C)
     *
     * @this {CPU}
     */
    opMOVDC()
    {
        this.regD = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x52 (MOV D,D)
     *
     * @this {CPU}
     */
    opMOVDD()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x53 (MOV D,E)
     *
     * @this {CPU}
     */
    opMOVDE()
    {
        this.regD = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x54 (MOV D,H)
     *
     * @this {CPU}
     */
    opMOVDH()
    {
        this.regD = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x55 (MOV D,L)
     *
     * @this {CPU}
     */
    opMOVDL()
    {
        this.regD = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x56 (MOV D,M)
     *
     * @this {CPU}
     */
    opMOVDM()
    {
        this.regD = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x57 (MOV D,A)
     *
     * @this {CPU}
     */
    opMOVDA()
    {
        this.regD = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x58 (MOV E,B)
     *
     * @this {CPU}
     */
    opMOVEB()
    {
        this.regE = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x59 (MOV E,C)
     *
     * @this {CPU}
     */
    opMOVEC()
    {
        this.regE = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x5A (MOV E,D)
     *
     * @this {CPU}
     */
    opMOVED()
    {
        this.regE = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x5B (MOV E,E)
     *
     * @this {CPU}
     */
    opMOVEE()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x5C (MOV E,H)
     *
     * @this {CPU}
     */
    opMOVEH()
    {
        this.regE = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x5D (MOV E,L)
     *
     * @this {CPU}
     */
    opMOVEL()
    {
        this.regE = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x5E (MOV E,M)
     *
     * @this {CPU}
     */
    opMOVEM()
    {
        this.regE = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x5F (MOV E,A)
     *
     * @this {CPU}
     */
    opMOVEA()
    {
        this.regE = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x60 (MOV H,B)
     *
     * @this {CPU}
     */
    opMOVHB()
    {
        this.regH = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x61 (MOV H,C)
     *
     * @this {CPU}
     */
    opMOVHC()
    {
        this.regH = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x62 (MOV H,D)
     *
     * @this {CPU}
     */
    opMOVHD()
    {
        this.regH = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x63 (MOV H,E)
     *
     * @this {CPU}
     */
    opMOVHE()
    {
        this.regH = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x64 (MOV H,H)
     *
     * @this {CPU}
     */
    opMOVHH()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x65 (MOV H,L)
     *
     * @this {CPU}
     */
    opMOVHL()
    {
        this.regH = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x66 (MOV H,M)
     *
     * @this {CPU}
     */
    opMOVHM()
    {
        this.regH = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x67 (MOV H,A)
     *
     * @this {CPU}
     */
    opMOVHA()
    {
        this.regH = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x68 (MOV L,B)
     *
     * @this {CPU}
     */
    opMOVLB()
    {
        this.regL = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x69 (MOV L,C)
     *
     * @this {CPU}
     */
    opMOVLC()
    {
        this.regL = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x6A (MOV L,D)
     *
     * @this {CPU}
     */
    opMOVLD()
    {
        this.regL = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x6B (MOV L,E)
     *
     * @this {CPU}
     */
    opMOVLE()
    {
        this.regL = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x6C (MOV L,H)
     *
     * @this {CPU}
     */
    opMOVLH()
    {
        this.regL = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x6D (MOV L,L)
     *
     * @this {CPU}
     */
    opMOVLL()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x6E (MOV L,M)
     *
     * @this {CPU}
     */
    opMOVLM()
    {
        this.regL = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x6F (MOV L,A)
     *
     * @this {CPU}
     */
    opMOVLA()
    {
        this.regL = this.regA;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x70 (MOV M,B)
     *
     * @this {CPU}
     */
    opMOVMB()
    {
        this.setByte(this.getHL(), this.regB);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x71 (MOV M,C)
     *
     * @this {CPU}
     */
    opMOVMC()
    {
        this.setByte(this.getHL(), this.regC);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x72 (MOV M,D)
     *
     * @this {CPU}
     */
    opMOVMD()
    {
        this.setByte(this.getHL(), this.regD);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x73 (MOV M,E)
     *
     * @this {CPU}
     */
    opMOVME()
    {
        this.setByte(this.getHL(), this.regE);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x74 (MOV M,H)
     *
     * @this {CPU}
     */
    opMOVMH()
    {
        this.setByte(this.getHL(), this.regH);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x75 (MOV M,L)
     *
     * @this {CPU}
     */
    opMOVML()
    {
        this.setByte(this.getHL(), this.regL);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x76 (HLT)
     *
     * @this {CPU}
     */
    opHLT()
    {
        this.nCyclesClocked += 7;
        /*
         * The CPU is never REALLY halted by a HLT instruction; instead, we call requestHALT(), which
         * which sets INTFLAG.HALT and then ends the current burst; the CPU should not execute any
         * more instructions until checkINTR() indicates that a hardware interrupt has been requested.
         */
        this.requestHALT();
        /*
         * If interrupts have been disabled, then the machine is dead in the water (there is no NMI
         * NMI generation mechanism for this CPU), so let's stop the CPU; similarly, if the HALT message
         * category is enabled, then the Debugger must want us to stop the CPU.
         */
        if (!this.getIF() || this.isMessageOn(MESSAGE.HALT)) {
            let addr = this.getPC() - 1;
            this.setPC(addr);           // this is purely for the Debugger's benefit, to show the HLT
            this.time.stop();
        }
    }

    /**
     * op=0x77 (MOV M,A)
     *
     * @this {CPU}
     */
    opMOVMA()
    {
        this.setByte(this.getHL(), this.regA);
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x78 (MOV A,B)
     *
     * @this {CPU}
     */
    opMOVAB()
    {
        this.regA = this.regB;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x79 (MOV A,C)
     *
     * @this {CPU}
     */
    opMOVAC()
    {
        this.regA = this.regC;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x7A (MOV A,D)
     *
     * @this {CPU}
     */
    opMOVAD()
    {
        this.regA = this.regD;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x7B (MOV A,E)
     *
     * @this {CPU}
     */
    opMOVAE()
    {
        this.regA = this.regE;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x7C (MOV A,H)
     *
     * @this {CPU}
     */
    opMOVAH()
    {
        this.regA = this.regH;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x7D (MOV A,L)
     *
     * @this {CPU}
     */
    opMOVAL()
    {
        this.regA = this.regL;
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x7E (MOV A,M)
     *
     * @this {CPU}
     */
    opMOVAM()
    {
        this.regA = this.getByte(this.getHL());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x7F (MOV A,A)
     *
     * @this {CPU}
     */
    opMOVAA()
    {
        this.nCyclesClocked += 5;
    }

    /**
     * op=0x80 (ADD B)
     *
     * @this {CPU}
     */
    opADDB()
    {
        this.regA = this.addByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x81 (ADD C)
     *
     * @this {CPU}
     */
    opADDC()
    {
        this.regA = this.addByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x82 (ADD D)
     *
     * @this {CPU}
     */
    opADDD()
    {
        this.regA = this.addByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x83 (ADD E)
     *
     * @this {CPU}
     */
    opADDE()
    {
        this.regA = this.addByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x84 (ADD H)
     *
     * @this {CPU}
     */
    opADDH()
    {
        this.regA = this.addByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x85 (ADD L)
     *
     * @this {CPU}
     */
    opADDL()
    {
        this.regA = this.addByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x86 (ADD M)
     *
     * @this {CPU}
     */
    opADDM()
    {
        this.regA = this.addByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x87 (ADD A)
     *
     * @this {CPU}
     */
    opADDA()
    {
        this.regA = this.addByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x88 (ADC B)
     *
     * @this {CPU}
     */
    opADCB()
    {
        this.regA = this.addByteCarry(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x89 (ADC C)
     *
     * @this {CPU}
     */
    opADCC()
    {
        this.regA = this.addByteCarry(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x8A (ADC D)
     *
     * @this {CPU}
     */
    opADCD()
    {
        this.regA = this.addByteCarry(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x8B (ADC E)
     *
     * @this {CPU}
     */
    opADCE()
    {
        this.regA = this.addByteCarry(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x8C (ADC H)
     *
     * @this {CPU}
     */
    opADCH()
    {
        this.regA = this.addByteCarry(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x8D (ADC L)
     *
     * @this {CPU}
     */
    opADCL()
    {
        this.regA = this.addByteCarry(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x8E (ADC M)
     *
     * @this {CPU}
     */
    opADCM()
    {
        this.regA = this.addByteCarry(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x8F (ADC A)
     *
     * @this {CPU}
     */
    opADCA()
    {
        this.regA = this.addByteCarry(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x90 (SUB B)
     *
     * @this {CPU}
     */
    opSUBB()
    {
        this.regA = this.subByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x91 (SUB C)
     *
     * @this {CPU}
     */
    opSUBC()
    {
        this.regA = this.subByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x92 (SUB D)
     *
     * @this {CPU}
     */
    opSUBD()
    {
        this.regA = this.subByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x93 (SUB E)
     *
     * @this {CPU}
     */
    opSUBE()
    {
        this.regA = this.subByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x94 (SUB H)
     *
     * @this {CPU}
     */
    opSUBH()
    {
        this.regA = this.subByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x95 (SUB L)
     *
     * @this {CPU}
     */
    opSUBL()
    {
        this.regA = this.subByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x96 (SUB M)
     *
     * @this {CPU}
     */
    opSUBM()
    {
        this.regA = this.subByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x97 (SUB A)
     *
     * @this {CPU}
     */
    opSUBA()
    {
        this.regA = this.subByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x98 (SBB B)
     *
     * @this {CPU}
     */
    opSBBB()
    {
        this.regA = this.subByteBorrow(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x99 (SBB C)
     *
     * @this {CPU}
     */
    opSBBC()
    {
        this.regA = this.subByteBorrow(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x9A (SBB D)
     *
     * @this {CPU}
     */
    opSBBD()
    {
        this.regA = this.subByteBorrow(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x9B (SBB E)
     *
     * @this {CPU}
     */
    opSBBE()
    {
        this.regA = this.subByteBorrow(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x9C (SBB H)
     *
     * @this {CPU}
     */
    opSBBH()
    {
        this.regA = this.subByteBorrow(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x9D (SBB L)
     *
     * @this {CPU}
     */
    opSBBL()
    {
        this.regA = this.subByteBorrow(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0x9E (SBB M)
     *
     * @this {CPU}
     */
    opSBBM()
    {
        this.regA = this.subByteBorrow(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0x9F (SBB A)
     *
     * @this {CPU}
     */
    opSBBA()
    {
        this.regA = this.subByteBorrow(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA0 (ANA B)
     *
     * @this {CPU}
     */
    opANAB()
    {
        this.regA = this.andByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA1 (ANA C)
     *
     * @this {CPU}
     */
    opANAC()
    {
        this.regA = this.andByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA2 (ANA D)
     *
     * @this {CPU}
     */
    opANAD()
    {
        this.regA = this.andByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA3 (ANA E)
     *
     * @this {CPU}
     */
    opANAE()
    {
        this.regA = this.andByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA4 (ANA H)
     *
     * @this {CPU}
     */
    opANAH()
    {
        this.regA = this.andByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA5 (ANA L)
     *
     * @this {CPU}
     */
    opANAL()
    {
        this.regA = this.andByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA6 (ANA M)
     *
     * @this {CPU}
     */
    opANAM()
    {
        this.regA = this.andByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xA7 (ANA A)
     *
     * @this {CPU}
     */
    opANAA()
    {
        this.regA = this.andByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA8 (XRA B)
     *
     * @this {CPU}
     */
    opXRAB()
    {
        this.regA = this.xorByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xA9 (XRA C)
     *
     * @this {CPU}
     */
    opXRAC()
    {
        this.regA = this.xorByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xAA (XRA D)
     *
     * @this {CPU}
     */
    opXRAD()
    {
        this.regA = this.xorByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xAB (XRA E)
     *
     * @this {CPU}
     */
    opXRAE()
    {
        this.regA = this.xorByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xAC (XRA H)
     *
     * @this {CPU}
     */
    opXRAH()
    {
        this.regA = this.xorByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xAD (XRA L)
     *
     * @this {CPU}
     */
    opXRAL()
    {
        this.regA = this.xorByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xAE (XRA M)
     *
     * @this {CPU}
     */
    opXRAM()
    {
        this.regA = this.xorByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xAF (XRA A)
     *
     * @this {CPU}
     */
    opXRAA()
    {
        this.regA = this.xorByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB0 (ORA B)
     *
     * @this {CPU}
     */
    opORAB()
    {
        this.regA = this.orByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB1 (ORA C)
     *
     * @this {CPU}
     */
    opORAC()
    {
        this.regA = this.orByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB2 (ORA D)
     *
     * @this {CPU}
     */
    opORAD()
    {
        this.regA = this.orByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB3 (ORA E)
     *
     * @this {CPU}
     */
    opORAE()
    {
        this.regA = this.orByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB4 (ORA H)
     *
     * @this {CPU}
     */
    opORAH()
    {
        this.regA = this.orByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB5 (ORA L)
     *
     * @this {CPU}
     */
    opORAL()
    {
        this.regA = this.orByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB6 (ORA M)
     *
     * @this {CPU}
     */
    opORAM()
    {
        this.regA = this.orByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xB7 (ORA A)
     *
     * @this {CPU}
     */
    opORAA()
    {
        this.regA = this.orByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB8 (CMP B)
     *
     * @this {CPU}
     */
    opCMPB()
    {
        this.subByte(this.regB);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xB9 (CMP C)
     *
     * @this {CPU}
     */
    opCMPC()
    {
        this.subByte(this.regC);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xBA (CMP D)
     *
     * @this {CPU}
     */
    opCMPD()
    {
        this.subByte(this.regD);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xBB (CMP E)
     *
     * @this {CPU}
     */
    opCMPE()
    {
        this.subByte(this.regE);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xBC (CMP H)
     *
     * @this {CPU}
     */
    opCMPH()
    {
        this.subByte(this.regH);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xBD (CMP L)
     *
     * @this {CPU}
     */
    opCMPL()
    {
        this.subByte(this.regL);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xBE (CMP M)
     *
     * @this {CPU}
     */
    opCMPM()
    {
        this.subByte(this.getByte(this.getHL()));
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xBF (CMP A)
     *
     * @this {CPU}
     */
    opCMPA()
    {
        this.subByte(this.regA);
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xC0 (RNZ)
     *
     * @this {CPU}
     */
    opRNZ()
    {
        if (!this.getZF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xC1 (POP B)
     *
     * @this {CPU}
     */
    opPOPB()
    {
        this.setBC(this.popWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xC2 (JNZ a16)
     *
     * @this {CPU}
     */
    opJNZ()
    {
        let w = this.getPCWord();
        if (!this.getZF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xC3 (JMP a16)
     *
     * @this {CPU}
     */
    opJMP()
    {
        this.setPC(this.getPCWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xC4 (CNZ a16)
     *
     * @this {CPU}
     */
    opCNZ()
    {
        let w = this.getPCWord();
        if (!this.getZF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xC5 (PUSH B)
     *
     * @this {CPU}
     */
    opPUSHB()
    {
        this.pushWord(this.getBC());
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xC6 (ADI d8)
     *
     * @this {CPU}
     */
    opADI()
    {
        this.regA = this.addByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xC7 (RST 0)
     *
     * @this {CPU}
     */
    opRST0()
    {
        this.pushWord(this.getPC());
        this.setPC(0);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xC8 (RZ)
     *
     * @this {CPU}
     */
    opRZ()
    {
        if (this.getZF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xC9 (RET)
     *
     * @this {CPU}
     */
    opRET()
    {
        this.setPC(this.popWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xCA (JZ a16)
     *
     * @this {CPU}
     */
    opJZ()
    {
        let w = this.getPCWord();
        if (this.getZF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xCC (CZ a16)
     *
     * @this {CPU}
     */
    opCZ()
    {
        let w = this.getPCWord();
        if (this.getZF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xCD (CALL a16)
     *
     * @this {CPU}
     */
    opCALL()
    {
        let w = this.getPCWord();
        this.pushWord(this.getPC());
        this.setPC(w);
        this.nCyclesClocked += 17;
    }

    /**
     * op=0xCE (ACI d8)
     *
     * @this {CPU}
     */
    opACI()
    {
        this.regA = this.addByteCarry(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xCF (RST 1)
     *
     * @this {CPU}
     */
    opRST1()
    {
        this.pushWord(this.getPC());
        this.setPC(0x08);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xD0 (RNC)
     *
     * @this {CPU}
     */
    opRNC()
    {
        if (!this.getCF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xD1 (POP D)
     *
     * @this {CPU}
     */
    opPOPD()
    {
        this.setDE(this.popWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xD2 (JNC a16)
     *
     * @this {CPU}
     */
    opJNC()
    {
        let w = this.getPCWord();
        if (!this.getCF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xD3 (OUT d8)
     *
     * @this {CPU}
     */
    opOUT()
    {
        let port = this.getPCByte();
        this.busIO.writeData(port, this.regA);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xD4 (CNC a16)
     *
     * @this {CPU}
     */
    opCNC()
    {
        let w = this.getPCWord();
        if (!this.getCF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xD5 (PUSH D)
     *
     * @this {CPU}
     */
    opPUSHD()
    {
        this.pushWord(this.getDE());
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xD6 (SUI d8)
     *
     * @this {CPU}
     */
    opSUI()
    {
        this.regA = this.subByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xD7 (RST 2)
     *
     * @this {CPU}
     */
    opRST2()
    {
        this.pushWord(this.getPC());
        this.setPC(0x10);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xD8 (RC)
     *
     * @this {CPU}
     */
    opRC()
    {
        if (this.getCF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xDA (JC a16)
     *
     * @this {CPU}
     */
    opJC()
    {
        let w = this.getPCWord();
        if (this.getCF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xDB (IN d8)
     *
     * @this {CPU}
     */
    opIN()
    {
        let port = this.getPCByte();
        this.regA = this.busIO.readData(port) & 0xff;
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xDC (CC a16)
     *
     * @this {CPU}
     */
    opCC()
    {
        let w = this.getPCWord();
        if (this.getCF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xDE (SBI d8)
     *
     * @this {CPU}
     */
    opSBI()
    {
        this.regA = this.subByteBorrow(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xDF (RST 3)
     *
     * @this {CPU}
     */
    opRST3()
    {
        this.pushWord(this.getPC());
        this.setPC(0x18);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xE0 (RPO)
     *
     * @this {CPU}
     */
    opRPO()
    {
        if (!this.getPF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xE1 (POP H)
     *
     * @this {CPU}
     */
    opPOPH()
    {
        this.setHL(this.popWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xE2 (JPO a16)
     *
     * @this {CPU}
     */
    opJPO()
    {
        let w = this.getPCWord();
        if (!this.getPF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xE3 (XTHL)
     *
     * @this {CPU}
     */
    opXTHL()
    {
        let w = this.popWord();
        this.pushWord(this.getHL());
        this.setHL(w);
        this.nCyclesClocked += 18;
    }

    /**
     * op=0xE4 (CPO a16)
     *
     * @this {CPU}
     */
    opCPO()
    {
        let w = this.getPCWord();
        if (!this.getPF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xE5 (PUSH H)
     *
     * @this {CPU}
     */
    opPUSHH()
    {
        this.pushWord(this.getHL());
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xE6 (ANI d8)
     *
     * @this {CPU}
     */
    opANI()
    {
        this.regA = this.andByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xE7 (RST 4)
     *
     * @this {CPU}
     */
    opRST4()
    {
        this.pushWord(this.getPC());
        this.setPC(0x20);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xE8 (RPE)
     *
     * @this {CPU}
     */
    opRPE()
    {
        if (this.getPF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xE9 (PCHL)
     *
     * @this {CPU}
     */
    opPCHL()
    {
        this.setPC(this.getHL());
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xEA (JPE a16)
     *
     * @this {CPU}
     */
    opJPE()
    {
        let w = this.getPCWord();
        if (this.getPF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xEB (XCHG)
     *
     * @this {CPU}
     */
    opXCHG()
    {
        let w = this.getHL();
        this.setHL(this.getDE());
        this.setDE(w);
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xEC (CPE a16)
     *
     * @this {CPU}
     */
    opCPE()
    {
        let w = this.getPCWord();
        if (this.getPF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xEE (XRI d8)
     *
     * @this {CPU}
     */
    opXRI()
    {
        this.regA = this.xorByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xEF (RST 5)
     *
     * @this {CPU}
     */
    opRST5()
    {
        this.pushWord(this.getPC());
        this.setPC(0x28);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xF0 (RP)
     *
     * @this {CPU}
     */
    opRP()
    {
        if (!this.getSF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xF1 (POP PSW)
     *
     * @this {CPU}
     */
    opPOPSW()
    {
        this.setPSW(this.popWord());
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xF2 (JP a16)
     *
     * @this {CPU}
     */
    opJP()
    {
        let w = this.getPCWord();
        if (!this.getSF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xF3 (DI)
     *
     * @this {CPU}
     */
    opDI()
    {
        this.clearIF();
        this.nCyclesClocked += 4;
    }

    /**
     * op=0xF4 (CP a16)
     *
     * @this {CPU}
     */
    opCP()
    {
        let w = this.getPCWord();
        if (!this.getSF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xF5 (PUSH PSW)
     *
     * @this {CPU}
     */
    opPUPSW()
    {
        this.pushWord(this.getPSW());
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xF6 (ORI d8)
     *
     * @this {CPU}
     */
    opORI()
    {
        this.regA = this.orByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xF7 (RST 6)
     *
     * @this {CPU}
     */
    opRST6()
    {
        this.pushWord(this.getPC());
        this.setPC(0x30);
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xF8 (RM)
     *
     * @this {CPU}
     */
    opRM()
    {
        if (this.getSF()) {
            this.setPC(this.popWord());
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xF9 (SPHL)
     *
     * @this {CPU}
     */
    opSPHL()
    {
        this.setSP(this.getHL());
        this.nCyclesClocked += 5;
    }

    /**
     * op=0xFA (JM a16)
     *
     * @this {CPU}
     */
    opJM()
    {
        let w = this.getPCWord();
        if (this.getSF()) this.setPC(w);
        this.nCyclesClocked += 10;
    }

    /**
     * op=0xFB (EI)
     *
     * @this {CPU}
     */
    opEI()
    {
        this.setIF();
        this.nCyclesClocked += 4;
        this.checkINTR();
    }

    /**
     * op=0xFC (CM a16)
     *
     * @this {CPU}
     */
    opCM()
    {
        let w = this.getPCWord();
        if (this.getSF()) {
            this.pushWord(this.getPC());
            this.setPC(w);
            this.nCyclesClocked += 6;
        }
        this.nCyclesClocked += 11;
    }

    /**
     * op=0xFE (CPI d8)
     *
     * @this {CPU}
     */
    opCPI()
    {
        this.subByte(this.getPCByte());
        this.nCyclesClocked += 7;
    }

    /**
     * op=0xFF (RST 7)
     *
     * @this {CPU}
     */
    opRST7()
    {
        this.pushWord(this.getPC());
        this.setPC(0x38);
        this.nCyclesClocked += 11;
    }

    /**
     * resetRegs()
     *
     * @this {CPU}
     */
    resetRegs()
    {
        this.regA = 0;
        this.regB = 0;
        this.regC = 0;
        this.regD = 0;
        this.regE = 0;
        this.regH = 0;
        this.regL = 0;
        this.setSP(0);
        this.setPC(this.addrReset);

        /*
         * regPCLast is an internal register that simply snapshots the PC at the start of every instruction;
         * this is useful not only for CPUs that need to support instruction restartability, but also for
         * diagnostic/debugging purposes.
         */
        this.regPCLast = this.regPC;

        /*
         * This resets the Processor Status flags (regPS), along with all the internal "result registers".
         */
        this.setPS(0);

        /*
         * intFlags contains some internal states we use to indicate whether a hardware interrupt (INTFLAG.INTR) or
         * Trap software interrupt (INTR.TRAP) has been requested, as well as when we're in a "HLT" state (INTFLAG.HALT)
         * that requires us to wait for a hardware interrupt (INTFLAG.INTR) before continuing execution.
         */
        this.intFlags = CPU.INTFLAG.NONE;
    }

    /**
     * setReset(addr)
     *
     * @this {CPU}
     * @param {number} addr
     */
    setReset(addr)
    {
        this.addrReset = addr;
        this.setPC(addr);
    }

    /**
     * getBC()
     *
     * @this {CPU}
     * @return {number}
     */
    getBC()
    {
        return (this.regB << 8) | this.regC;
    }

    /**
     * setBC(w)
     *
     * @this {CPU}
     * @param {number} w
     */
    setBC(w)
    {
        this.regB = (w >> 8) & 0xff;
        this.regC = w & 0xff;
    }

    /**
     * getDE()
     *
     * @this {CPU}
     * @return {number}
     */
    getDE()
    {
        return (this.regD << 8) | this.regE;
    }

    /**
     * setDE(w)
     *
     * @this {CPU}
     * @param {number} w
     */
    setDE(w)
    {
        this.regD = (w >> 8) & 0xff;
        this.regE = w & 0xff;
    }

    /**
     * getHL()
     *
     * @this {CPU}
     * @return {number}
     */
    getHL()
    {
        return (this.regH << 8) | this.regL;
    }

    /**
     * setHL(w)
     *
     * @this {CPU}
     * @param {number} w
     */
    setHL(w)
    {
        this.regH = (w >> 8) & 0xff;
        this.regL = w & 0xff;
    }

    /**
     * getSP()
     *
     * @this {CPU}
     * @return {number}
     */
    getSP()
    {
        return this.regSP;
    }

    /**
     * setSP(off)
     *
     * @this {CPU}
     * @param {number} off
     */
    setSP(off)
    {
        this.regSP = off & 0xffff;
    }

    /**
     * getPC()
     *
     * @this {CPU}
     * @return {number}
     */
    getPC()
    {
        return this.regPC;
    }

    /**
     * getPCLast()
     *
     * Returns the physical address of the last (or currently executing) instruction.
     *
     * @this {CPU}
     * @return {number}
     */
    getPCLast()
    {
        return this.regPCLast;
    }

    /**
     * offPC()
     *
     * @this {CPU}
     * @param {number} off
     * @return {number}
     */
    offPC(off)
    {
        return (this.regPC + off) & 0xffff;
    }

    /**
     * setPC(off)
     *
     * @this {CPU}
     * @param {number} off
     */
    setPC(off)
    {
        this.regPC = off & 0xffff;
    }

    /**
     * clearCF()
     *
     * @this {CPU}
     */
    clearCF()
    {
        this.resultZeroCarry &= 0xff;
    }

    /**
     * getCF()
     *
     * @this {CPU}
     * @return {number} 0 or 1 (CPU.PS.CF)
     */
    getCF()
    {
        return (this.resultZeroCarry & 0x100)? CPU.PS.CF : 0;
    }

    /**
     * setCF()
     *
     * @this {CPU}
     */
    setCF()
    {
        this.resultZeroCarry |= 0x100;
    }

    /**
     * updateCF(CF)
     *
     * @this {CPU}
     * @param {number} CF (0x000 or 0x100)
     */
    updateCF(CF)
    {
        this.resultZeroCarry = (this.resultZeroCarry & 0xff) | CF;
    }

    /**
     * clearPF()
     *
     * @this {CPU}
     */
    clearPF()
    {
        if (this.getPF()) this.resultParitySign ^= 0x1;
    }

    /**
     * getPF()
     *
     * @this {CPU}
     * @return {number} 0 or CPU.PS.PF
     */
    getPF()
    {
        return (CPU.PARITY[this.resultParitySign & 0xff])? CPU.PS.PF : 0;
    }

    /**
     * setPF()
     *
     * @this {CPU}
     */
    setPF()
    {
        if (!this.getPF()) this.resultParitySign ^= 0x1;
    }

    /**
     * clearAF()
     *
     * @this {CPU}
     */
    clearAF()
    {
        this.resultAuxOverflow = (this.resultParitySign & 0x10) | (this.resultAuxOverflow & ~0x10);
    }

    /**
     * getAF()
     *
     * @this {CPU}
     * @return {number} 0 or CPU.PS.AF
     */
    getAF()
    {
        return ((this.resultParitySign ^ this.resultAuxOverflow) & 0x10)? CPU.PS.AF : 0;
    }

    /**
     * setAF()
     *
     * @this {CPU}
     */
    setAF()
    {
        this.resultAuxOverflow = (~this.resultParitySign & 0x10) | (this.resultAuxOverflow & ~0x10);
    }

    /**
     * clearZF()
     *
     * @this {CPU}
     */
    clearZF()
    {
        this.resultZeroCarry |= 0xff;
    }

    /**
     * getZF()
     *
     * @this {CPU}
     * @return {number} 0 or CPU.PS.ZF
     */
    getZF()
    {
        return (this.resultZeroCarry & 0xff)? 0 : CPU.PS.ZF;
    }

    /**
     * setZF()
     *
     * @this {CPU}
     */
    setZF()
    {
        this.resultZeroCarry &= ~0xff;
    }

    /**
     * clearSF()
     *
     * @this {CPU}
     */
    clearSF()
    {
        if (this.getSF()) this.resultParitySign ^= 0xc0;
    }

    /**
     * getSF()
     *
     * @this {CPU}
     * @return {number} 0 or CPU.PS.SF
     */
    getSF()
    {
        return (this.resultParitySign & 0x80)? CPU.PS.SF : 0;
    }

    /**
     * setSF()
     *
     * @this {CPU}
     */
    setSF()
    {
        if (!this.getSF()) this.resultParitySign ^= 0xc0;
    }

    /**
     * clearIF()
     *
     * @this {CPU}
     */
    clearIF()
    {
        this.regPS &= ~CPU.PS.IF;
    }

    /**
     * getIF()
     *
     * @this {CPU}
     * @return {number} 0 or CPU.PS.IF
     */
    getIF()
    {
        return (this.regPS & CPU.PS.IF);
    }

    /**
     * setIF()
     *
     * @this {CPU}
     */
    setIF()
    {
        this.regPS |= CPU.PS.IF;
    }

    /**
     * getPS()
     *
     * @this {CPU}
     * @return {number}
     */
    getPS()
    {
        return (this.regPS & ~CPU.PS.RESULT) | (this.getSF() | this.getZF() | this.getAF() | this.getPF() | this.getCF());
    }

    /**
     * setPS(regPS)
     *
     * @this {CPU}
     * @param {number} regPS
     */
    setPS(regPS)
    {
        this.resultZeroCarry = this.resultParitySign = this.resultAuxOverflow = 0;
        if (regPS & CPU.PS.CF) this.resultZeroCarry |= 0x100;
        if (!(regPS & CPU.PS.PF)) this.resultParitySign |= 0x01;
        if (regPS & CPU.PS.AF) this.resultAuxOverflow |= 0x10;
        if (!(regPS & CPU.PS.ZF)) this.resultZeroCarry |= 0xff;
        if (regPS & CPU.PS.SF) this.resultParitySign ^= 0xc0;
        this.regPS = (this.regPS & ~(CPU.PS.RESULT | CPU.PS.INTERNAL)) | (regPS & CPU.PS.INTERNAL) | CPU.PS.SET;

    }

    /**
     * getPSW()
     *
     * @this {CPU}
     * @return {number}
     */
    getPSW()
    {
        return (this.getPS() & CPU.PS.MASK) | (this.regA << 8);
    }

    /**
     * setPSW(w)
     *
     * @this {CPU}
     * @param {number} w
     */
    setPSW(w)
    {
        this.setPS((w & CPU.PS.MASK) | (this.regPS & ~CPU.PS.MASK));
        this.regA = w >> 8;
    }

    /**
     * addByte(src)
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA + src
     */
    addByte(src)
    {
        this.resultAuxOverflow = this.regA ^ src;
        return this.resultParitySign = (this.resultZeroCarry = this.regA + src) & 0xff;
    }

    /**
     * addByteCarry(src)
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA + src + carry
     */
    addByteCarry(src)
    {
        this.resultAuxOverflow = this.regA ^ src;
        return this.resultParitySign = (this.resultZeroCarry = this.regA + src + ((this.resultZeroCarry & 0x100)? 1 : 0)) & 0xff;
    }

    /**
     * andByte(src)
     *
     * Ordinarily, one would expect the Auxiliary Carry flag (AF) to be clear after this operation,
     * but apparently the 8080 will set AF if bit 3 in either operand is set.
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA & src
     */
    andByte(src)
    {
        this.resultZeroCarry = this.resultParitySign = this.resultAuxOverflow = this.regA & src;
        if ((this.regA | src) & 0x8) this.resultAuxOverflow ^= 0x10;        // set AF by inverting bit 4 in resultAuxOverflow
        return this.resultZeroCarry;
    }

    /**
     * decByte(b)
     *
     * We perform this operation using 8-bit two's complement arithmetic, by negating and then adding
     * the implied src of 1.  This appears to mimic how the 8080 manages the Auxiliary Carry flag (AF).
     *
     * @this {CPU}
     * @param {number} b
     * @return {number}
     */
    decByte(b)
    {
        this.resultAuxOverflow = b ^ 0xff;
        b = this.resultParitySign = (b + 0xff) & 0xff;
        this.resultZeroCarry = (this.resultZeroCarry & ~0xff) | b;
        return b;
    }

    /**
     * incByte(b)
     *
     * @this {CPU}
     * @param {number} b
     * @return {number}
     */
    incByte(b)
    {
        this.resultAuxOverflow = b;
        b = this.resultParitySign = (b + 1) & 0xff;
        this.resultZeroCarry = (this.resultZeroCarry & ~0xff) | b;
        return b;
    }

    /**
     * orByte(src)
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA | src
     */
    orByte(src)
    {
        return this.resultParitySign = this.resultZeroCarry = this.resultAuxOverflow = this.regA | src;
    }

    /**
     * subByte(src)
     *
     * We perform this operation using 8-bit two's complement arithmetic, by inverting src, adding
     * src + 1, and then inverting the resulting carry (resultZeroCarry ^ 0x100).  This appears to mimic
     * how the 8080 manages the Auxiliary Carry flag (AF).
     *
     * This function is also used as a cmpByte() function; compare instructions simply ignore the
     * return value.
     *
     * Example: A=66, SUI $10
     *
     * If we created the two's complement of 0x10 by negating it, there would just be one addition:
     *
     *      0110 0110   (0x66)
     *    + 1111 0000   (0xF0)  (ie, -0x10)
     *      ---------
     *    1 0101 0110   (0x56)
     *
     * But in order to mimic the 8080's AF flag, we must perform the two's complement of src in two steps,
     * inverting it before the add, and then incrementing after the add; eg:
     *
     *      0110 0110   (0x66)
     *    + 1110 1111   (0xEF)  (ie, ~0x10)
     *      ---------
     *    1 0101 0101   (0x55)
     *    + 0000 0001   (0x01)
     *      ---------
     *    1 0101 0110   (0x56)
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA - src
     */
    subByte(src)
    {
        src ^= 0xff;
        this.resultAuxOverflow = this.regA ^ src;
        return this.resultParitySign = (this.resultZeroCarry = (this.regA + src + 1) ^ 0x100) & 0xff;
    }

    /**
     * subByteBorrow(src)
     *
     * We perform this operation using 8-bit two's complement arithmetic, using logic similar to subByte(),
     * but changing the final increment to a conditional increment, because if the Carry flag (CF) is set, then
     * we don't need to perform the increment at all.
     *
     * This mimics the behavior of subByte() when the Carry flag (CF) is clear, and hopefully also mimics how the
     * 8080 manages the Auxiliary Carry flag (AF) when the Carry flag (CF) is set.
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA - src - carry
     */
    subByteBorrow(src)
    {
        src ^= 0xff;
        this.resultAuxOverflow = this.regA ^ src;
        return this.resultParitySign = (this.resultZeroCarry = (this.regA + src + ((this.resultZeroCarry & 0x100)? 0 : 1)) ^ 0x100) & 0xff;
    }

    /**
     * xorByte(src)
     *
     * @this {CPU}
     * @param {number} src
     * @return {number} regA ^ src
     */
    xorByte(src)
    {
        return this.resultParitySign = this.resultZeroCarry = this.resultAuxOverflow = this.regA ^ src;
    }

    /**
     * getByte(addr)
     *
     * @this {CPU}
     * @param {number} addr is a linear address
     * @return {number} byte (8-bit) value at that address
     */
    getByte(addr)
    {
        return this.busMemory.readData(addr)|0;
    }

    /**
     * getWord(addr)
     *
     * @this {CPU}
     * @param {number} addr is a linear address
     * @return {number} word (16-bit) value at that address
     */
    getWord(addr)
    {
        return this.busMemory.readPair(addr);
    }

    /**
     * setByte(addr, b)
     *
     * @this {CPU}
     * @param {number} addr is a linear address
     * @param {number} b is the byte (8-bit) value to write (which we truncate to 8 bits; required by opSTOSb)
     */
    setByte(addr, b)
    {
        this.busMemory.writeData(addr, b & 0xff);
    }

    /**
     * setWord(addr, w)
     *
     * @this {CPU}
     * @param {number} addr is a linear address
     * @param {number} w is the word (16-bit) value to write (which we truncate to 16 bits to be safe)
     */
    setWord(addr, w)
    {
        this.busMemory.writePair(addr, w & 0xffff);
    }

    /**
     * getPCByte()
     *
     * @this {CPU}
     * @return {number} byte at the current PC; PC advanced by 1
     */
    getPCByte()
    {
        let b = this.getByte(this.regPC);
        this.setPC(this.regPC + 1);
        return b;
    }

    /**
     * getPCWord()
     *
     * @this {CPU}
     * @return {number} word at the current PC; PC advanced by 2
     */
    getPCWord()
    {
        let w = this.getWord(this.regPC);
        this.setPC(this.regPC + 2);
        return w;
    }

    /**
     * popWord()
     *
     * @this {CPU}
     * @return {number} word popped from the current SP; SP increased by 2
     */
    popWord()
    {
        let w = this.getWord(this.regSP);
        this.setSP(this.regSP + 2);
        return w;
    }

    /**
     * pushWord(w)
     *
     * @this {CPU}
     * @param {number} w is the word (16-bit) value to push at current SP; SP decreased by 2
     */
    pushWord(w)
    {
        this.setSP(this.regSP - 2);
        this.setWord(this.regSP, w);
    }

    /**
     * checkINTR()
     *
     * @this {CPU}
     * @return {boolean} true if execution may proceed, false if not
     */
    checkINTR()
    {
        /*
         * If the Debugger is single-stepping, isRunning() will be false, which we take advantage
         * of here to avoid processing interrupts.  The Debugger will have to issue a "g" command
         * to resume normal interrupt processing.
         */
        if (this.time.isRunning()) {
            if ((this.intFlags & CPU.INTFLAG.INTR) && this.getIF()) {
                let nLevel;
                for (nLevel = 0; nLevel < 8; nLevel++) {
                    if (this.intFlags & (1 << nLevel)) break;
                }
                this.clearINTR(nLevel);
                this.clearIF();
                this.intFlags &= ~CPU.INTFLAG.HALT;
                this.aOps[CPU.OPCODE.RST0 | (nLevel << 3)].call(this);
            }
        }
        if (this.intFlags & CPU.INTFLAG.HALT) {
            /*
             * As discussed in opHLT(), the CPU is never REALLY halted by a HLT instruction; instead, opHLT()
             * calls requestHALT(), which sets INTFLAG.HALT and then ends the current burst; the CPU should not
             * execute any more instructions until checkINTR() indicates a hardware interrupt has been requested.
             */
            this.time.endBurst();
            return false;
        }
        return true;
    }

    /**
     * clearINTR(nLevel)
     *
     * Clear the corresponding interrupt level.
     *
     * nLevel can either be a valid interrupt level (0-7), or -1 to clear all pending interrupts
     * (eg, in the event of a system-wide reset).
     *
     * @this {CPU}
     * @param {number} nLevel (0-7, or -1 for all)
     */
    clearINTR(nLevel)
    {
        let bitsClear = nLevel < 0? 0xff : (1 << nLevel);
        this.intFlags &= ~bitsClear;
    }

    /**
     * requestHALT()
     *
     * @this {CPU}
     */
    requestHALT()
    {
        this.intFlags |= CPU.INTFLAG.HALT;
        this.time.endBurst();
    }

    /**
     * requestINTR(nLevel)
     *
     * Request the corresponding interrupt level.
     *
     * Each interrupt level (0-7) has its own intFlags bit (0-7).  If the Interrupt Flag (IF) is also
     * set, then we know that checkINTR() will want to issue the interrupt, so we end the current burst.
     *
     * @this {CPU}
     * @param {number} nLevel (0-7)
     */
    requestINTR(nLevel)
    {
        this.intFlags |= (1 << nLevel);
        if (this.getIF()) {
            this.time.endBurst();
        }
    }

    /**
     * toInstruction(addr, opcode)
     *
     * Returns a string representation of the specified instruction.
     *
     * @this {CPU}
     * @param {number} addr
     * @param {number|undefined} [opcode]
     * @return {string}
     */
    toInstruction(addr, opcode)
    {
        return this.dbg && this.dbg.dumpInstruction(addr, 1) || "";
    }

    /**
     * toString()
     *
     * Returns a string representation of the current CPU state.
     *
     * @this {CPU}
     * @return {string}
     */
    toString()
    {
        return this.sprintf("A=%02X BC=%04X DE=%04X HL=%04X SP=%04X I%d S%d Z%d A%d P%d C%d\n%s", this.regA, this.getBC(), this.getDE(), this.getHL(), this.getSP(), this.getIF()?1:0, this.getSF()?1:0, this.getZF()?1:0, this.getAF()?1:0, this.getPF()?1:0, this.getCF()?1:0, this.toInstruction(this.regPC));
    }

    /**
     * updateCPU(fTransition)
     *
     * Enumerate all bindings and update their values.
     *
     * Called by Time's update() function whenever 1) its YIELDS_PER_UPDATE threshold is reached
     * (default is twice per second), 2) a step() operation has just finished (ie, the device is being
     * single-stepped), and 3) a start() or stop() transition has occurred.
     *
     * @this {CPU}
     * @param {boolean} [fTransition]
     */
    updateCPU(fTransition)
    {
        // TODO: Decide what bindings we want to support, and update them as appropriate.
    }
}

/*
 * CPU model numbers (supported); future supported models could include the Z80.
 */
 CPU.MODEL_8080 = 8080;

/*
 * This constant is used to mark points in the code where the physical address being returned
 * is invalid and should not be used.
 */
CPU.ADDR_INVALID = undefined;

/*
 * Processor Status flag definitions (stored in regPS)
 */
CPU.PS = {
    CF:     0x0001,     // bit 0: Carry Flag
    BIT1:   0x0002,     // bit 1: reserved, always set
    PF:     0x0004,     // bit 2: Parity Flag
    BIT3:   0x0008,     // bit 3: reserved, always clear
    AF:     0x0010,     // bit 4: Auxiliary Carry Flag
    BIT5:   0x0020,     // bit 5: reserved, always clear
    ZF:     0x0040,     // bit 6: Zero Flag
    SF:     0x0080,     // bit 7: Sign Flag
    ALL:    0x00D5,     // all "arithmetic" flags (CF, PF, AF, ZF, SF)
    MASK:   0x00FF,     //
    IF:     0x0200      // bit 9: Interrupt Flag (set if interrupts enabled; Intel calls this the INTE bit)
};

/*
 * These are the internal PS bits (outside of PS.MASK) that getPS() and setPS() can get and set,
 * but which cannot be seen with any of the documented instructions.
 */
CPU.PS.INTERNAL = CPU.PS.IF;

/*
 * PS "arithmetic" flags are NOT stored in regPS; they are maintained across separate result registers,
 * hence the RESULT designation.
 */
CPU.PS.RESULT   = CPU.PS.CF | CPU.PS.PF | CPU.PS.AF | CPU.PS.ZF | CPU.PS.SF;

/*
 * These are the "always set" PS bits for the 8080.
 */
CPU.PS.SET      = CPU.PS.BIT1;

CPU.PARITY = [          // 256-byte array with a 1 wherever the number of set bits of the array index is EVEN
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1
];

/*
 * Interrupt-related flags (stored in intFlags)
 */
CPU.INTFLAG = {
    NONE:   0x0000,
    INTR:   0x00ff,     // mask for 8 bits, representing interrupt levels 0-7
    HALT:   0x0100      // halt requested; see opHLT()
};

/*
 * Opcode definitions
 */
CPU.OPCODE = {
    HLT:    0x76,       // Halt
    ACI:    0xCE,       // Add with Carry Immediate (affects PS.ALL)
    CALL:   0xCD,       // Call
    RST0:   0xC7
    // to be continued....
};

Defs.CLASSES["CPU"] = CPU;

/**
 * @copyright https://www.pcjs.org/modules/devices/cpu/dbgio.js (C) Jeff Parsons 2012-2019
 */

/** @typedef {{ off: number, seg: number, type: number }} */
var Address;

/** @typedef {{ address: Address, type: number, name: string }} */
var SymbolObj;

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

/**
 * @copyright https://www.pcjs.org/modules/devices/cpu/dbg8080.js (C) Jeff Parsons 2012-2019
 */

/**
 * Debugger for the 8080 CPU
 *
 * @class {Debugger}
 * @unrestricted
 */
class Debugger extends DbgIO {
    /**
     * DbgIO(idMachine, idDevice, config)
     *
     * @this {Debugger}
     * @param {string} idMachine
     * @param {string} idDevice
     * @param {Config} [config]
     */
    constructor(idMachine, idDevice, config)
    {
        super(idMachine, idDevice, config);
        this.style = Debugger.STYLE_8086;
        this.maxOpLength = 3;
    }

    /**
     * unassemble(opcodes)
     *
     * Overrides DbgIO's default unassemble() function with one that understands 8080 instructions.
     *
     * @this {Debugger}
     * @param {Address} address (advanced by the number of processed opcodes)
     * @param {Array.<number>} opcodes (each processed opcode is shifted out, reducing the size of the array)
     * @return {string}
     */
    unassemble(address, opcodes)
    {
        let dbg = this;
        let sAddr = this.dumpAddress(address), sBytes = "";
        let sLabel = this.getSymbolName(address, DbgIO.SYMBOL.LABEL);
        let sComment = this.getSymbolName(address, DbgIO.SYMBOL.COMMENT);

        let getNextByte = function() {
            let byte = opcodes.shift();
            sBytes += dbg.toBase(byte, 16, 8, "");
            dbg.addAddress(address, 1);
            return byte;
        };

        let getNextWord = function() {
            return getNextByte() | (getNextByte() << 8);
        };

        /**
         * getImmOperand(type)
         *
         * @param {number} type
         * @return {string} operand
         */
        let getImmOperand = function(type) {
            var sOperand = ' ';
            var typeSize = type & Debugger.TYPE_SIZE;
            switch (typeSize) {
            case Debugger.TYPE_BYTE:
                sOperand = dbg.toBase(getNextByte(), 16, 8, "");
                break;
            case Debugger.TYPE_SBYTE:
                sOperand = dbg.toBase((getNextWord() << 24) >> 24, 16, 16, "");
                break;
            case Debugger.TYPE_WORD:
                sOperand = dbg.toBase(getNextWord(), 16, 16, "");
                break;
            default:
                return "imm(" + dbg.toBase(type, 16, 16, "") + ')';
            }
            if (dbg.style == Debugger.STYLE_8086 && (type & Debugger.TYPE_MEM)) {
                sOperand = '[' + sOperand + ']';
            } else if (!(type & Debugger.TYPE_REG)) {
                sOperand = (dbg.style == Debugger.STYLE_8080? '$' : "0x") + sOperand;
            }
            return sOperand;
        };

        /**
         * getRegOperand(iReg, type)
         *
         * @param {number} iReg
         * @param {number} type
         * @return {string} operand
         */
        let getRegOperand = function(iReg, type)
        {
            /*
             * Although this breaks with 8080 assembler conventions, I'm going to experiment with some different
             * mnemonics; specifically, "[HL]" instead of "M".  This is also more in keeping with how getImmOperand()
             * displays memory references (ie, by enclosing them in brackets).
             */
            var sOperand = Debugger.REGS[iReg];
            if (dbg.style == Debugger.STYLE_8086 && (type & Debugger.TYPE_MEM)) {
                if (iReg == Debugger.REG_M) {
                    sOperand = "HL";
                }
                sOperand = '[' + sOperand + ']';
            }
            return sOperand;
        };

        let opcode = getNextByte();

        let asOpcodes = this.style != Debugger.STYLE_8086? Debugger.INS_NAMES : Debugger.INS_NAMES_8086;
        let aOpDesc = Debugger.aaOpDescs[opcode];
        let iOpcode = aOpDesc[0];

        let sOperands = "";
        let sOpcode = asOpcodes[iOpcode];
        let cOperands = aOpDesc.length - 1;
        let typeSizeDefault = Debugger.TYPE_NONE, type;

        for (let iOperand = 1; iOperand <= cOperands; iOperand++) {

            let sOperand = "";

            type = aOpDesc[iOperand];
            if (type === undefined) continue;
            if ((type & Debugger.TYPE_OPT) && this.style == Debugger.STYLE_8080) continue;

            let typeMode = type & Debugger.TYPE_MODE;
            if (!typeMode) continue;

            let typeSize = type & Debugger.TYPE_SIZE;
            if (!typeSize) {
                type |= typeSizeDefault;
            } else {
                typeSizeDefault = typeSize;
            }

            let typeOther = type & Debugger.TYPE_OTHER;
            if (!typeOther) {
                type |= (iOperand == 1? Debugger.TYPE_OUT : Debugger.TYPE_IN);
            }

            if (typeMode & Debugger.TYPE_IMM) {
                sOperand = getImmOperand(type);
            }
            else if (typeMode & Debugger.TYPE_REG) {
                sOperand = getRegOperand((type & Debugger.TYPE_IREG) >> 8, type);
            }
            else if (typeMode & Debugger.TYPE_INT) {
                sOperand = ((opcode >> 3) & 0x7).toString();
            }

            if (!sOperand || !sOperand.length) {
                sOperands = "INVALID";
                break;
            }
            if (sOperands.length > 0) sOperands += ',';
            sOperands += (sOperand || "???");
        }

        let s = this.sprintf("%s %-7s%s %-7s %s", sAddr, sBytes, (type & Debugger.TYPE_UNDOC)? '*' : ' ', sOpcode, sOperands);
        if (sLabel) s = sLabel + ":\n" + s;
        if (sComment) s = this.sprintf("%-32s; %s", s, sComment);
        return s + "\n";
    }
}

Debugger.STYLE_8080 = 8080;
Debugger.STYLE_8086 = 8086;

/*
 * CPU instruction ordinals
 */
Debugger.INS = {
    NONE:   0,  ACI:    1,  ADC:    2,  ADD:    3,  ADI:    4,  ANA:    5,  ANI:    6,  CALL:   7,
    CC:     8,  CM:     9,  CNC:   10,  CNZ:   11,  CP:    12,  CPE:   13,  CPO:   14,  CZ:    15,
    CMA:   16,  CMC:   17,  CMP:   18,  CPI:   19,  DAA:   20,  DAD:   21,  DCR:   22,  DCX:   23,
    DI:    24,  EI:    25,  HLT:   26,  IN:    27,  INR:   28,  INX:   29,  JMP:   30,  JC:    31,
    JM:    32,  JNC:   33,  JNZ:   34,  JP:    35,  JPE:   36,  JPO:   37,  JZ:    38,  LDA:   39,
    LDAX:  40,  LHLD:  41,  LXI:   42,  MOV:   43,  MVI:   44,  NOP:   45,  ORA:   46,  ORI:   47,
    OUT:   48,  PCHL:  49,  POP:   50,  PUSH:  51,  RAL:   52,  RAR:   53,  RET:   54,  RC:    55,
    RM:    56,  RNC:   57,  RNZ:   58,  RP:    59,  RPE:   60,  RPO:   61,  RZ:    62,  RLC:   63,
    RRC:   64,  RST:   65,  SBB:   66,  SBI:   67,  SHLD:  68,  SPHL:  69,  STA:   70,  STAX:  71,
    STC:   72,  SUB:   73,  SUI:   74,  XCHG:  75,  XRA:   76,  XRI:   77,  XTHL:  78
};

/*
 * CPU instruction names (mnemonics), indexed by CPU instruction ordinal (above)
 *
 * If you change the default style, using the "s" command (eg, "s 8086"), then the 8086 table
 * will be used instead.  TODO: Add a "s z80" command for Z80-style mnemonics.
 */
Debugger.INS_NAMES = [
    "NONE",     "ACI",      "ADC",      "ADD",      "ADI",      "ANA",      "ANI",      "CALL",
    "CC",       "CM",       "CNC",      "CNZ",      "CP",       "CPE",      "CPO",      "CZ",
    "CMA",      "CMC",      "CMP",      "CPI",      "DAA",      "DAD",      "DCR",      "DCX",
    "DI",       "EI",       "HLT",      "IN",       "INR",      "INX",      "JMP",      "JC",
    "JM",       "JNC",      "JNZ",      "JP",       "JPE",      "JPO",      "JZ",       "LDA",
    "LDAX",     "LHLD",     "LXI",      "MOV",      "MVI",      "NOP",      "ORA",      "ORI",
    "OUT",      "PCHL",     "POP",      "PUSH",     "RAL",      "RAR",      "RET",      "RC",
    "RM",       "RNC",      "RNZ",      "RP",       "RPE",      "RPO",      "RZ",       "RLC",
    "RRC",      "RST",      "SBB",      "SBI",      "SHLD",     "SPHL",     "STA",      "STAX",
    "STC",      "SUB",      "SUI",      "XCHG",     "XRA",      "XRI",      "XTHL"
];

Debugger.INS_NAMES_8086 = [
    "NONE",     "ADC",      "ADC",      "ADD",      "ADD",      "AND",      "AND",      "CALL",
    "CALLC",    "CALLS",    "CALLNC",   "CALLNZ",   "CALLNS",   "CALLP",    "CALLNP",   "CALLZ",
    "NOT",      "CMC",      "CMP",      "CMP",      "DAA",      "ADD",      "DEC",      "DEC",
    "CLI",      "STI",      "HLT",      "IN",       "INC",      "INC",      "JMP",      "JC",
    "JS",       "JNC",      "JNZ",      "JNS",      "JP",       "JNP",      "JZ",       "MOV",
    "MOV",      "MOV",      "MOV",      "MOV",      "MOV",      "NOP",      "OR",       "OR",
    "OUT",      "JMP",      "POP",      "PUSH",     "RCL",      "RCR",      "RET",      "RETC",
    "RETS",     "RETNC",    "RETNZ",    "RETNS",    "RETP",     "RETNP",    "RETZ",     "ROL",
    "ROR",      "RST",      "SBB",      "SBB",      "MOV",      "MOV",      "MOV",      "MOV",
    "STC",      "SUB",      "SUB",      "XCHG",     "XOR",      "XOR",      "XCHG"
];

Debugger.REG_B      = 0x00;
Debugger.REG_C      = 0x01;
Debugger.REG_D      = 0x02;
Debugger.REG_E      = 0x03;
Debugger.REG_H      = 0x04;
Debugger.REG_L      = 0x05;
Debugger.REG_M      = 0x06;
Debugger.REG_A      = 0x07;
Debugger.REG_BC     = 0x08;
Debugger.REG_DE     = 0x09;
Debugger.REG_HL     = 0x0A;
Debugger.REG_SP     = 0x0B;
Debugger.REG_PC     = 0x0C;
Debugger.REG_PS     = 0x0D;
Debugger.REG_PSW    = 0x0E;         // aka AF if Z80-style mnemonics

/*
 * NOTE: "PS" is the complete processor status, which includes bits like the Interrupt flag (IF),
 * which is NOT the same as "PSW", which is the low 8 bits of "PS" combined with "A" in the high byte.
 */
Debugger.REGS = [
    "B", "C", "D", "E", "H", "L", "M", "A", "BC", "DE", "HL", "SP", "PC", "PS", "PSW"
];

/*
 * Operand type descriptor masks and definitions
 */
Debugger.TYPE_SIZE  = 0x000F;       // size field
Debugger.TYPE_MODE  = 0x00F0;       // mode field
Debugger.TYPE_IREG  = 0x0F00;       // implied register field
Debugger.TYPE_OTHER = 0xF000;       // "other" field

/*
 * TYPE_SIZE values
 */
Debugger.TYPE_NONE  = 0x0000;       // (all other TYPE fields ignored)
Debugger.TYPE_BYTE  = 0x0001;       // byte, regardless of operand size
Debugger.TYPE_SBYTE = 0x0002;       // byte sign-extended to word
Debugger.TYPE_WORD  = 0x0003;       // word (16-bit value)

/*
 * TYPE_MODE values
 */
Debugger.TYPE_REG   = 0x0010;       // register
Debugger.TYPE_IMM   = 0x0020;       // immediate data
Debugger.TYPE_ADDR  = 0x0033;       // immediate (word) address
Debugger.TYPE_MEM   = 0x0040;       // memory reference
Debugger.TYPE_INT   = 0x0080;       // interrupt level encoded in instruction (bits 3-5)

/*
 * TYPE_IREG values, based on the REG_* constants.
 *
 * Note that TYPE_M isn't really a register, just an alternative form of TYPE_HL | TYPE_MEM.
 */
Debugger.TYPE_A     = (Debugger.REG_A  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_B     = (Debugger.REG_B  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_C     = (Debugger.REG_C  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_D     = (Debugger.REG_D  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_E     = (Debugger.REG_E  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_H     = (Debugger.REG_H  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_L     = (Debugger.REG_L  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE);
Debugger.TYPE_M     = (Debugger.REG_M  << 8 | Debugger.TYPE_REG | Debugger.TYPE_BYTE | Debugger.TYPE_MEM);
Debugger.TYPE_BC    = (Debugger.REG_BC << 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);
Debugger.TYPE_DE    = (Debugger.REG_DE << 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);
Debugger.TYPE_HL    = (Debugger.REG_HL << 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);
Debugger.TYPE_SP    = (Debugger.REG_SP << 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);
Debugger.TYPE_PC    = (Debugger.REG_PC << 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);
Debugger.TYPE_PSW   = (Debugger.REG_PSW<< 8 | Debugger.TYPE_REG | Debugger.TYPE_WORD);

/*
 * TYPE_OTHER bit definitions
 */
Debugger.TYPE_IN    = 0x1000;       // operand is input
Debugger.TYPE_OUT   = 0x2000;       // operand is output
Debugger.TYPE_BOTH  = (Debugger.TYPE_IN | Debugger.TYPE_OUT);
Debugger.TYPE_OPT   = 0x4000;       // optional operand (ie, normally omitted in 8080 assembly language)
Debugger.TYPE_UNDOC = 0x8000;       // opcode is an undocumented alternative encoding

/*
 * The aaOpDescs array is indexed by opcode, and each element is a sub-array (aOpDesc) that describes
 * the corresponding opcode. The sub-elements are as follows:
 *
 *      [0]: {number} of the opcode name (see INS.*)
 *      [1]: {number} containing the destination operand descriptor bit(s), if any
 *      [2]: {number} containing the source operand descriptor bit(s), if any
 *      [3]: {number} containing the occasional third operand descriptor bit(s), if any
 *
 * These sub-elements are all optional. If [0] is not present, the opcode is undefined; if [1] is not
 * present (or contains zero), the opcode has no (or only implied) operands; if [2] is not present, the
 * opcode has only a single operand.  And so on.
 *
 * Additional default rules:
 *
 *      1) If no TYPE_OTHER bits are specified for the first (destination) operand, TYPE_OUT is assumed;
 *      2) If no TYPE_OTHER bits are specified for the second (source) operand, TYPE_IN is assumed;
 *      3) If no size is specified for the second operand, the size is assumed to match the first operand.
 */
Debugger.aaOpDescs = [
/* 0x00 */  [Debugger.INS.NOP],
/* 0x01 */  [Debugger.INS.LXI,   Debugger.TYPE_BC,    Debugger.TYPE_IMM],
/* 0x02 */  [Debugger.INS.STAX,  Debugger.TYPE_BC   | Debugger.TYPE_MEM, Debugger.TYPE_A    | Debugger.TYPE_OPT],
/* 0x03 */  [Debugger.INS.INX,   Debugger.TYPE_BC],
/* 0x04 */  [Debugger.INS.INR,   Debugger.TYPE_B],
/* 0x05 */  [Debugger.INS.DCR,   Debugger.TYPE_B],
/* 0x06 */  [Debugger.INS.MVI,   Debugger.TYPE_B,     Debugger.TYPE_IMM],
/* 0x07 */  [Debugger.INS.RLC],
/* 0x08 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x09 */  [Debugger.INS.DAD,   Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_BC],
/* 0x0A */  [Debugger.INS.LDAX,  Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_BC   | Debugger.TYPE_MEM],
/* 0x0B */  [Debugger.INS.DCX,   Debugger.TYPE_BC],
/* 0x0C */  [Debugger.INS.INR,   Debugger.TYPE_C],
/* 0x0D */  [Debugger.INS.DCR,   Debugger.TYPE_C],
/* 0x0E */  [Debugger.INS.MVI,   Debugger.TYPE_C,     Debugger.TYPE_IMM],
/* 0x0F */  [Debugger.INS.RRC],
/* 0x10 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x11 */  [Debugger.INS.LXI,   Debugger.TYPE_DE,    Debugger.TYPE_IMM],
/* 0x12 */  [Debugger.INS.STAX,  Debugger.TYPE_DE   | Debugger.TYPE_MEM, Debugger.TYPE_A    | Debugger.TYPE_OPT],
/* 0x13 */  [Debugger.INS.INX,   Debugger.TYPE_DE],
/* 0x14 */  [Debugger.INS.INR,   Debugger.TYPE_D],
/* 0x15 */  [Debugger.INS.DCR,   Debugger.TYPE_D],
/* 0x16 */  [Debugger.INS.MVI,   Debugger.TYPE_D,     Debugger.TYPE_IMM],
/* 0x17 */  [Debugger.INS.RAL],
/* 0x18 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x19 */  [Debugger.INS.DAD,   Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_DE],
/* 0x1A */  [Debugger.INS.LDAX,  Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_DE   | Debugger.TYPE_MEM],
/* 0x1B */  [Debugger.INS.DCX,   Debugger.TYPE_DE],
/* 0x1C */  [Debugger.INS.INR,   Debugger.TYPE_E],
/* 0x1D */  [Debugger.INS.DCR,   Debugger.TYPE_E],
/* 0x1E */  [Debugger.INS.MVI,   Debugger.TYPE_E,     Debugger.TYPE_IMM],
/* 0x1F */  [Debugger.INS.RAR],
/* 0x20 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x21 */  [Debugger.INS.LXI,   Debugger.TYPE_HL,    Debugger.TYPE_IMM],
/* 0x22 */  [Debugger.INS.SHLD,  Debugger.TYPE_ADDR | Debugger.TYPE_MEM, Debugger.TYPE_HL   | Debugger.TYPE_OPT],
/* 0x23 */  [Debugger.INS.INX,   Debugger.TYPE_HL],
/* 0x24 */  [Debugger.INS.INR,   Debugger.TYPE_H],
/* 0x25 */  [Debugger.INS.DCR,   Debugger.TYPE_H],
/* 0x26 */  [Debugger.INS.MVI,   Debugger.TYPE_H,     Debugger.TYPE_IMM],
/* 0x27 */  [Debugger.INS.DAA],
/* 0x28 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x29 */  [Debugger.INS.DAD,   Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_HL],
/* 0x2A */  [Debugger.INS.LHLD,  Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_ADDR | Debugger.TYPE_MEM],
/* 0x2B */  [Debugger.INS.DCX,   Debugger.TYPE_HL],
/* 0x2C */  [Debugger.INS.INR,   Debugger.TYPE_L],
/* 0x2D */  [Debugger.INS.DCR,   Debugger.TYPE_L],
/* 0x2E */  [Debugger.INS.MVI,   Debugger.TYPE_L,     Debugger.TYPE_IMM],
/* 0x2F */  [Debugger.INS.CMA,   Debugger.TYPE_A    | Debugger.TYPE_OPT],
/* 0x30 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x31 */  [Debugger.INS.LXI,   Debugger.TYPE_SP,    Debugger.TYPE_IMM],
/* 0x32 */  [Debugger.INS.STA,   Debugger.TYPE_ADDR | Debugger.TYPE_MEM, Debugger.TYPE_A    | Debugger.TYPE_OPT],
/* 0x33 */  [Debugger.INS.INX,   Debugger.TYPE_SP],
/* 0x34 */  [Debugger.INS.INR,   Debugger.TYPE_M],
/* 0x35 */  [Debugger.INS.DCR,   Debugger.TYPE_M],
/* 0x36 */  [Debugger.INS.MVI,   Debugger.TYPE_M,     Debugger.TYPE_IMM],
/* 0x37 */  [Debugger.INS.STC],
/* 0x38 */  [Debugger.INS.NOP,   Debugger.TYPE_UNDOC],
/* 0x39 */  [Debugger.INS.DAD,   Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_SP],
/* 0x3A */  [Debugger.INS.LDA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_ADDR | Debugger.TYPE_MEM],
/* 0x3B */  [Debugger.INS.DCX,   Debugger.TYPE_SP],
/* 0x3C */  [Debugger.INS.INR,   Debugger.TYPE_A],
/* 0x3D */  [Debugger.INS.DCR,   Debugger.TYPE_A],
/* 0x3E */  [Debugger.INS.MVI,   Debugger.TYPE_A,     Debugger.TYPE_IMM],
/* 0x3F */  [Debugger.INS.CMC],
/* 0x40 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_B],
/* 0x41 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_C],
/* 0x42 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_D],
/* 0x43 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_E],
/* 0x44 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_H],
/* 0x45 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_L],
/* 0x46 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_M],
/* 0x47 */  [Debugger.INS.MOV,   Debugger.TYPE_B,     Debugger.TYPE_A],
/* 0x48 */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_B],
/* 0x49 */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_C],
/* 0x4A */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_D],
/* 0x4B */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_E],
/* 0x4C */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_H],
/* 0x4D */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_L],
/* 0x4E */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_M],
/* 0x4F */  [Debugger.INS.MOV,   Debugger.TYPE_C,     Debugger.TYPE_A],
/* 0x50 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_B],
/* 0x51 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_C],
/* 0x52 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_D],
/* 0x53 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_E],
/* 0x54 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_H],
/* 0x55 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_L],
/* 0x56 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_M],
/* 0x57 */  [Debugger.INS.MOV,   Debugger.TYPE_D,     Debugger.TYPE_A],
/* 0x58 */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_B],
/* 0x59 */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_C],
/* 0x5A */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_D],
/* 0x5B */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_E],
/* 0x5C */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_H],
/* 0x5D */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_L],
/* 0x5E */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_M],
/* 0x5F */  [Debugger.INS.MOV,   Debugger.TYPE_E,     Debugger.TYPE_A],
/* 0x60 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_B],
/* 0x61 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_C],
/* 0x62 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_D],
/* 0x63 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_E],
/* 0x64 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_H],
/* 0x65 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_L],
/* 0x66 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_M],
/* 0x67 */  [Debugger.INS.MOV,   Debugger.TYPE_H,     Debugger.TYPE_A],
/* 0x68 */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_B],
/* 0x69 */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_C],
/* 0x6A */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_D],
/* 0x6B */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_E],
/* 0x6C */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_H],
/* 0x6D */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_L],
/* 0x6E */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_M],
/* 0x6F */  [Debugger.INS.MOV,   Debugger.TYPE_L,     Debugger.TYPE_A],
/* 0x70 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_B],
/* 0x71 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_C],
/* 0x72 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_D],
/* 0x73 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_E],
/* 0x74 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_H],
/* 0x75 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_L],
/* 0x76 */  [Debugger.INS.HLT],
/* 0x77 */  [Debugger.INS.MOV,   Debugger.TYPE_M,     Debugger.TYPE_A],
/* 0x78 */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_B],
/* 0x79 */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_C],
/* 0x7A */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_D],
/* 0x7B */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_E],
/* 0x7C */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_H],
/* 0x7D */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_L],
/* 0x7E */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_M],
/* 0x7F */  [Debugger.INS.MOV,   Debugger.TYPE_A,     Debugger.TYPE_A],
/* 0x80 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0x81 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0x82 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0x83 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0x84 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0x85 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0x86 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0x87 */  [Debugger.INS.ADD,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0x88 */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0x89 */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0x8A */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0x8B */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0x8C */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0x8D */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0x8E */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0x8F */  [Debugger.INS.ADC,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0x90 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0x91 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0x92 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0x93 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0x94 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0x95 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0x96 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0x97 */  [Debugger.INS.SUB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0x98 */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0x99 */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0x9A */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0x9B */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0x9C */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0x9D */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0x9E */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0x9F */  [Debugger.INS.SBB,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0xA0 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0xA1 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0xA2 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0xA3 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0xA4 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0xA5 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0xA6 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0xA7 */  [Debugger.INS.ANA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0xA8 */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0xA9 */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0xAA */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0xAB */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0xAC */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0xAD */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0xAE */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0xAF */  [Debugger.INS.XRA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0xB0 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0xB1 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0xB2 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0xB3 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0xB4 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0xB5 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0xB6 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0xB7 */  [Debugger.INS.ORA,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0xB8 */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_B],
/* 0xB9 */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_C],
/* 0xBA */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_D],
/* 0xBB */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_E],
/* 0xBC */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_H],
/* 0xBD */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_L],
/* 0xBE */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_M],
/* 0xBF */  [Debugger.INS.CMP,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_A],
/* 0xC0 */  [Debugger.INS.RNZ],
/* 0xC1 */  [Debugger.INS.POP,   Debugger.TYPE_BC],
/* 0xC2 */  [Debugger.INS.JNZ,   Debugger.TYPE_ADDR],
/* 0xC3 */  [Debugger.INS.JMP,   Debugger.TYPE_ADDR],
/* 0xC4 */  [Debugger.INS.CNZ,   Debugger.TYPE_ADDR],
/* 0xC5 */  [Debugger.INS.PUSH,  Debugger.TYPE_BC],
/* 0xC6 */  [Debugger.INS.ADI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xC7 */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xC8 */  [Debugger.INS.RZ],
/* 0xC9 */  [Debugger.INS.RET],
/* 0xCA */  [Debugger.INS.JZ,    Debugger.TYPE_ADDR],
/* 0xCB */  [Debugger.INS.JMP,   Debugger.TYPE_ADDR | Debugger.TYPE_UNDOC],
/* 0xCC */  [Debugger.INS.CZ,    Debugger.TYPE_ADDR],
/* 0xCD */  [Debugger.INS.CALL,  Debugger.TYPE_ADDR],
/* 0xCE */  [Debugger.INS.ACI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xCF */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xD0 */  [Debugger.INS.RNC],
/* 0xD1 */  [Debugger.INS.POP,   Debugger.TYPE_DE],
/* 0xD2 */  [Debugger.INS.JNC,   Debugger.TYPE_ADDR],
/* 0xD3 */  [Debugger.INS.OUT,   Debugger.TYPE_IMM  | Debugger.TYPE_BYTE,Debugger.TYPE_A   | Debugger.TYPE_OPT],
/* 0xD4 */  [Debugger.INS.CNC,   Debugger.TYPE_ADDR],
/* 0xD5 */  [Debugger.INS.PUSH,  Debugger.TYPE_DE],
/* 0xD6 */  [Debugger.INS.SUI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xD7 */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xD8 */  [Debugger.INS.RC],
/* 0xD9 */  [Debugger.INS.RET,   Debugger.TYPE_UNDOC],
/* 0xDA */  [Debugger.INS.JC,    Debugger.TYPE_ADDR],
/* 0xDB */  [Debugger.INS.IN,    Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xDC */  [Debugger.INS.CC,    Debugger.TYPE_ADDR],
/* 0xDD */  [Debugger.INS.CALL,  Debugger.TYPE_ADDR | Debugger.TYPE_UNDOC],
/* 0xDE */  [Debugger.INS.SBI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xDF */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xE0 */  [Debugger.INS.RPO],
/* 0xE1 */  [Debugger.INS.POP,   Debugger.TYPE_HL],
/* 0xE2 */  [Debugger.INS.JPO,   Debugger.TYPE_ADDR],
/* 0xE3 */  [Debugger.INS.XTHL,  Debugger.TYPE_SP   | Debugger.TYPE_MEM| Debugger.TYPE_OPT,  Debugger.TYPE_HL | Debugger.TYPE_OPT],
/* 0xE4 */  [Debugger.INS.CPO,   Debugger.TYPE_ADDR],
/* 0xE5 */  [Debugger.INS.PUSH,  Debugger.TYPE_HL],
/* 0xE6 */  [Debugger.INS.ANI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xE7 */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xE8 */  [Debugger.INS.RPE],
/* 0xE9 */  [Debugger.INS.PCHL,  Debugger.TYPE_HL],
/* 0xEA */  [Debugger.INS.JPE,   Debugger.TYPE_ADDR],
/* 0xEB */  [Debugger.INS.XCHG,  Debugger.TYPE_HL   | Debugger.TYPE_OPT, Debugger.TYPE_DE  | Debugger.TYPE_OPT],
/* 0xEC */  [Debugger.INS.CPE,   Debugger.TYPE_ADDR],
/* 0xED */  [Debugger.INS.CALL,  Debugger.TYPE_ADDR | Debugger.TYPE_UNDOC],
/* 0xEE */  [Debugger.INS.XRI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xEF */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xF0 */  [Debugger.INS.RP],
/* 0xF1 */  [Debugger.INS.POP,   Debugger.TYPE_PSW],
/* 0xF2 */  [Debugger.INS.JP,    Debugger.TYPE_ADDR],
/* 0xF3 */  [Debugger.INS.DI],
/* 0xF4 */  [Debugger.INS.CP,    Debugger.TYPE_ADDR],
/* 0xF5 */  [Debugger.INS.PUSH,  Debugger.TYPE_PSW],
/* 0xF6 */  [Debugger.INS.ORI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xF7 */  [Debugger.INS.RST,   Debugger.TYPE_INT],
/* 0xF8 */  [Debugger.INS.RM],
/* 0xF9 */  [Debugger.INS.SPHL,  Debugger.TYPE_SP   | Debugger.TYPE_OPT, Debugger.TYPE_HL  | Debugger.TYPE_OPT],
/* 0xFA */  [Debugger.INS.JM,    Debugger.TYPE_ADDR],
/* 0xFB */  [Debugger.INS.EI],
/* 0xFC */  [Debugger.INS.CM,    Debugger.TYPE_ADDR],
/* 0xFD */  [Debugger.INS.CALL,  Debugger.TYPE_ADDR | Debugger.TYPE_UNDOC],
/* 0xFE */  [Debugger.INS.CPI,   Debugger.TYPE_A    | Debugger.TYPE_OPT, Debugger.TYPE_IMM | Debugger.TYPE_BYTE],
/* 0xFF */  [Debugger.INS.RST,   Debugger.TYPE_INT]
];

Defs.CLASSES["Debugger"] = Debugger;

/**
 * @copyright https://www.pcjs.org/modules/devices/main/machine.js (C) Jeff Parsons 2012-2019
 */

/**
 * @class {Machine}
 * @unrestricted
 * @property {CPU} cpu
 * @property {string} sConfigFile
 * @property {boolean} fConfigLoaded
 * @property {boolean} fPageLoaded
 */
class Machine extends Device {
    /**
     * Machine(idMachine, sConfig, sParms)
     *
     * If sConfig contains a JSON object definition, then we parse it immediately and save the result in this.config;
     * otherwise, we assume it's the URL of an JSON object definition, so we request the resource, and once it's loaded,
     * we parse it.
     *
     * One important change in v2: the order of the device objects in the JSON file determines creation/initialization order.
     * In general, the Machine object should always be first (it's always created first anyway), and the Time object should
     * be listed next, so that its services are available to any other device when they're created/initialized.
     *
     * Sample config:
     *
     *    {
     *      "ti57": {
     *        "class": "Machine",
     *        "type": "TI57",
     *        "name": "TI-57 Programmable Calculator Simulation",
     *        "version": 2.00,
     *        "autoSave": true,
     *        "autoStart": true,
     *        "bindings": {
     *          "power": "powerTI57",
     *          "reset": "resetTI57",
     *          "clear": "clearTI57",
     *          "print": "printTI57"
     *        }
     *      },
     *      "clock": {
     *        "class": "Time",
     *        "cyclesPerSecond": 650000
     *        "bindings": {
     *          "run": "runTI57",
     *          "speed": "speedTI57",
     *          "step": "stepTI57"
     *        },
     *        "overrides": ["cyclesPerSecond"]
     *      },
     *      "display": {
     *        "class": "LED",
     *        "type": 3,
     *        "cols": 12,
     *        "rows": 1,
     *        "color": "red",
     *        "bindings": {
     *          "container": "displayTI57"
     *        },
     *        "overrides": ["color","backgroundColor"]
     *      },
     *      "buttons": {
     *        "class": "Input",
     *        "map": [
     *          ["2nd",  "inv",  "lnx",  "\\b",  "clr"],
     *          ["lrn",  "xchg", "sq",   "sqrt", "rcp"],
     *          ["sst",  "sto",  "rcl",  "sum",  "exp"],
     *          ["bst",  "ee",   "(",    ")",    "/"],
     *          ["gto",  "7",    "8",    "9",    "*"],
     *          ["sbr",  "4",    "5",    "6",    "-"],
     *          ["rst",  "1",    "2",    "3",    "+"],
     *          ["r/s",  "0",    ".",    "+/-",  "=|\\r"]
     *        ],
     *        "location": [139, 325, 368, 478, 0.34, 0.5, 640, 853, 418, 180, 75, 36],
     *        "bindings": {
     *          "surface": "imageTI57"
     *        }
     *      },
     *      "rom": {
     *        "class": "ROM",
     *        "wordSize": 13,
     *        "valueSize": 16,
     *        "valueTotal": 2048,
     *        "littleEndian": true,
     *        "file": "ti57le.bin",
     *        "reference": "",
     *        "values": [
     *        ]
     *      },
     *      "cpu": {
     *        "class": "CPU",
     *        "type": "TMS-1500",
     *        "input": "buttons",
     *        "output": "display"
     *      }
     *    }
     *
     * @this {Machine}
     * @param {string} idMachine (of both the machine AND the <div> to contain it)
     * @param {string} sConfig (JSON configuration for entire machine, including any static resources)
     * @param {string} [sParms] (optional JSON parameters that can supplement or override the configuration)
     */
    constructor(idMachine, sConfig, sParms)
    {
        super(idMachine, idMachine);

        let machine = this;
        this.ready = false;
        this.powered = false;
        this.sParms = sParms;
        this.sConfigFile = "";
        this.fConfigLoaded = false;
        this.fPageLoaded = false;

        sConfig = sConfig.trim();
        if (sConfig[0] == '{') {
            this.loadConfig(sConfig);
        } else {
            this.sConfigFile = sConfig;
            this.getResource(this.sConfigFile, function onLoadConfig(sURL, sResource, readyState, nErrorCode) {
                if (readyState == 4) {
                    if (!nErrorCode && sResource) {
                        machine.loadConfig(sResource);
                        machine.initDevices();
                    }
                    else {
                        machine.printf("error (%d) loading configuration: %s\n", nErrorCode, sURL);
                    }
                }
            });
        }

        /*
         * Device initialization is now deferred until after the page is fully loaded, for the benefit
         * of devices (eg, Input) that may be dependent on page resources.
         *
         * Strangely, for these page events, I must use the window object rather than the document object.
         */
        window.addEventListener('load', function onLoadPage(event) {
            machine.fPageLoaded = true;
            machine.initDevices();
        });
        let sEvent = this.isUserAgent("iOS")? 'pagehide' : (this.isUserAgent("Opera")? 'unload' : undefined);
        window.addEventListener(sEvent || 'beforeunload', function onUnloadPage(event) {
            machine.killDevices();
        });
    }

    /**
     * addBinding(binding, element)
     *
     * @this {Machine}
     * @param {string} binding
     * @param {Element} element
     */
    addBinding(binding, element)
    {
        let machine = this;

        switch(binding) {

        case Machine.BINDING.POWER:
            element.onclick = function onClickPower() {
                if (machine.ready) {
                    machine.onPower();
                }
            };
            break;

        case Machine.BINDING.RESET:
            element.onclick = function onClickReset() {
                if (machine.ready) {
                    machine.onReset();
                }
            };
            break;
        }
        super.addBinding(binding, element);
    }

    /**
     * initDevices()
     *
     * Initializes devices in the proper order.  For example, any Time devices should be initialized first,
     * to ensure that their timer services are available to other devices within their constructor.
     *
     * However, we should avoid device order dependencies whenever possible, so if a Device can defer a call
     * to another Device until its onLoad() or onPower() handler can be called, even better.
     *
     * @this {Machine}
     */
    initDevices()
    {
        let power = true;
        if (this.fConfigLoaded && this.fPageLoaded) {
            for (let idDevice in this.deviceConfigs) {
                let sClass;
                try {
                    let config = this.deviceConfigs[idDevice];
                    sClass = config['class'];
                    if (!Defs.CLASSES[sClass]) {
                        this.printf("unrecognized %s device class: %s\n", idDevice, sClass);
                    }
                    else if (sClass == "Machine") {
                        this.printf("PCjs %s v%3.2f\n%s\n%s\n", config['name'], +VERSION, Machine.COPYRIGHT, Machine.LICENSE);
                        if (this.sConfigFile) this.printf("Configuration: %s\n", this.sConfigFile);
                    } else {
                        let device = new Defs.CLASSES[sClass](this.idMachine, idDevice, config);
                        if (MAXDEBUG) this.printf("%s device: %s\n", sClass, idDevice);
                    }
                }
                catch (err) {
                    this.printf("error initializing %s device '%s': %s\n", sClass, idDevice, err.message);
                    this.removeDevice(idDevice);
                    power = false;
                }
            }
            if (this.fAutoSave) {
                let state = this.loadLocalStorage();
                this.enumDevices(function onDeviceLoad(device) {
                    if (device.onLoad) {
                        if (!device.onLoad(state)) {
                            device.printf("unable to restore state for device: %s\n", device.idDevice);
                            return false;
                        }
                    }
                    return true;
                });
            }
            this.onPower(power);
        }
    }

    /**
     * killDevices()
     *
     * @this {Machine}
     */
    killDevices()
    {
        if (this.fAutoSave) {
            let state = [];
            this.enumDevices(function onDeviceSave(device) {
                if (device.onSave) {
                    device.onSave(state);
                }
                return true;
            });
            this.saveLocalStorage(state);
        }
        this.onPower(false);
    }

    /**
     * loadConfig(sConfig)
     *
     * @this {Machine}
     * @param {string} sConfig
     */
    loadConfig(sConfig)
    {
        try {
            this.deviceConfigs = JSON.parse(sConfig);
            this.checkConfig(this.deviceConfigs[this.idMachine]);
            this.fAutoSave = (this.config['autoSave'] !== false);
            this.fAutoStart = (this.config['autoStart'] !== false);
            if (this.sParms) {
                /*
                 * Historically, my web servers have not been consistent about quoting property names inside
                 * the optional parameters object, so we must use eval() instead of JSON.parse() to parse them.
                 * Of couse, the REAL problem is that JSON.parse() is being a dick about otherwise perfectly
                 * legitimate Object syntax, but I shall not repeat my long list of gripes about JSON here.
                 */
                let parms = /** @type {Object} */ (eval("(" + this.sParms + ")"));
                /*
                 * Slam all these parameters into the machine's config, overriding any matching machine configuration
                 * properties.  Any other devices that need access to these properties should use getMachineConfig().
                 */
                for (let prop in parms) {
                    this.config[prop] = parms[prop];
                }
            }
            this.fConfigLoaded = true;
        } catch(err) {
            let sError = err.message;
            let match = sError.match(/position ([0-9]+)/);
            if (match) {
                sError += " ('" + sConfig.substr(+match[1], 40).replace(/\s+/g, ' ') + "...')";
            }
            this.println("machine '" + this.idMachine + "' initialization error: " + sError);
        }
    }

    /**
     * onPower(on)
     *
     * @this {Machine}
     * @param {boolean} [on]
     */
    onPower(on = !this.powered)
    {
        let machine = this;
        if (on) this.println("power on");
        this.enumDevices(function onDevicePower(device) {
            if (device.onPower && device != machine) {
                if (device.config['class'] != "CPU" || machine.fAutoStart || machine.ready) {
                    device.onPower(on);
                } else {
                    /*
                     * If we're not going to start the CPU on the first power notification, then we should
                     * we fake a transition to the "stopped" state, so that the Debugger will display the current
                     * machine state.
                     */
                    device.time.update(true);
                }
            }
            return true;
        });
        this.ready = true;
        this.powered = on;
        if (!on) this.println("power off");
    }

    /**
     * onReset()
     *
     * @this {Machine}
     */
    onReset()
    {
        let machine = this;
        this.enumDevices(function onDeviceReset(device) {
            if (device.onReset && device != machine) {
                device.onReset();
            }
            return true;
        });
    }
}

Machine.BINDING = {
    POWER:      "power",
    RESET:      "reset",
};

Machine.COPYRIGHT = "Copyright © 2012-2019 Jeff Parsons <Jeff@pcjs.org>";
Machine.LICENSE = "License: GPL version 3 or later <http://gnu.org/licenses/gpl.html>";

/*
 * Create the designated machine FACTORY function (this should suffice for all compiled versions).
 *
 * In addition, expose the machine's COMMAND handler interface, so that it's easy to access any of the
 * machine's built-in commands from a browser or IDE debug console:
 *
 *      window.command("?")
 *
 * Normally, access to the COMMAND handlers will be through the machine's WebIO.BINDING.PRINT textarea,
 * but not all machines will have such a control, and sometimes that control will be inaccessible (eg, if
 * the browser is currently debugging the machine).
 */
window[FACTORY] = function(idMachine, sConfig, sParms) {
    let machine = new Machine(idMachine, sConfig, sParms);
    window[COMMAND] = function(commands) {
        return machine.parseCommands(commands);
    };
    return machine;
};

/*
 * If we're NOT running a compiled release (ie, FACTORY wasn't overriden from "Machine" to something else),
 * then create hard-coded aliases for all known factories; only DEBUG servers should be running uncompiled code.
 */
if (FACTORY == "Machine") {
    window['Invaders'] = window[FACTORY];
    window['LEDs'] = window[FACTORY];
    window['TMS1500'] = window[FACTORY];
    window['VT100'] = window[FACTORY];
}

Defs.CLASSES["Machine"] = Machine;
