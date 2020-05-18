// Copyright (c) 2020 Elijah Seed Arita
//
// Permission is hereby granted, free of charge, to any person obtaining a copy 
// of this software and associated documentation files (the "Software"), to deal 
// in the Software without restriction, including without limitation the rights 
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
// copies of the Software, and to permit persons to whom the Software is 
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in 
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
// SOFTWARE.

if (typeof exports === "undefined") exports = this;

class SerialReader {

    // Create a SerialReader with an ArrayBuffer
    // Position can be optionally specified
    // The buffer will not be modified
    constructor(buffer, pos) {
        this.dv = new DataView(buffer);
        this.pos = pos || 0;
    }

    delayedMove(move) {
        let saved = this.pos;
        this.pos += move;
        return saved;
    }

    getBuffer() {
        return this.dv.buffer;
    }

    // Read integer values

    ri8() { return this.dv.getInt8(this.delayedMove(1)); }
    ri16() { return this.dv.getInt16(this.delayedMove(2)); }
    ri32() { return this.dv.getInt32(this.delayedMove(4)); }
    ri64() { return this.dv.getInt64(this.delayedMove(8)); }

    // Read unsigned integer values

    ru8() { return this.dv.getUint8(this.delayedMove(1)); }
    ru16() { return this.dv.getUint16(this.delayedMove(2)); }
    ru32() { return this.dv.getUint32(this.delayedMove(4)); }
    ru64() { return this.dv.getUint64(this.delayedMove(8)); }

    // Read floating point values
    
    rf32() { return this.dv.getFloat32(this.delayedMove(4)); }
    rf64() { return this.dv.getFloat64(this.delayedMove(8)); }

    // Read boolean
    rbool() { return this.ru8() > 0; }
    
    // Read character
    rchar() { return String.fromCharCode(this.ru8()); }

    // Read variable size signed integer up to 32 bits
    riv() {
        let n = this.ruv();
        let sign = (n & 0x1) ? -1 : 1;
        n = (n & (~0x1)) >>> 1;
        return n * sign;
    }

    // Read variable size unsigned integer up to 32 bits
    ruv() {
        let n = 0;
        while (true) {
            let byte = this.ru8();
            
            n = (n << 7) | (byte & 0x7F);
            
            if (!(byte & 0x80)) return n;
        }
    }

    // Read ArrayBuffer of bytes
    rbytes() {
        let length = this.ruv();    
        return this.dv.buffer.slice(this.pos, this.pos += length);
    }

    // Read UTF-8 string
    rutf8() { 
        return new TextDecoder().decode(this.rarr());
    }
}

class SerialWriter {

    // Create a SerialWriter with an optional ArrayBuffer copy (not stored by 
    // reference) and an optional position
    // If not ArrayBuffer is provided, an empty one will be created, and pos
    // will be ignored
    // Never directly access the internal "buffer" variable, as it is not yet 
    // prepared for use
    // Use getBuffer() to retrieve the completed buffer when done writing
    constructor(buffer) {
        if (!buffer) {
            this.pos = 0;
            buffer = new ArrayBuffer(8);
        } else {
            this.pos = buffer.byteLength;
        }
        this.dv = new DataView(buffer.slice(0));
    }

    // Allocate enough space for up to "length" bytes to fit if necessary
    allocMin(length) {
        if (length >= this.dv.buffer.byteLength) {
            let newBuffer = new ArrayBuffer(Math.max(length, this.dv.buffer.byteLength * 2));
            new Uint8Array(newBuffer).set(new Uint8Array(this.dv.buffer));
            this.dv = new DataView(newBuffer);
        }
    }

    // Ensure there are at least additionalLength bytes after the saved position
    allocMinExtra(additionalLength) {
        this.allocMin(this.pos + additionalLength);
    }
    
    // Move the position and resize, return previous position for writing
    delayedMove(move) {
        let saved = this.pos;
        this.pos += move;
        this.allocMin(this.pos);
        
        return saved;
    }

    getBuffer() {
        return this.dv.buffer.slice(0, this.pos);
    }

    // Write integer values

    wi8(n) { this.dv.setInt8(this.delayedMove(1), n); }
    wi16(n) { this.dv.setInt16(this.delayedMove(2), n); }
    wi32(n) { this.dv.setInt32(this.delayedMove(4), n); }
    wi64(n) { this.dv.setInt64(this.delayedMove(8), n); }

    // Write unsigned integer values

    wu8(n) { this.dv.setUint8(this.delayedMove(1), n); }
    wu16(n) { this.dv.setUint16(this.delayedMove(2), n); }
    wu32(n) { this.dv.setUint32(this.delayedMove(4), n); }
    wu64(n) { this.dv.setUint64(this.delayedMove(8), n); }

    // Write floating point values
    
    wf32(n) { this.dv.setFloat32(this.delayedMove(4), n); }
    wf64(n) { this.dv.setFloat64(this.delayedMove(8), n); }

    // Write boolean
    wbool(b) { this.wu8(b ? 1 : 0); }

    // Write character
    wchar(ch) { this.wu8(ch.charCodeAt(0)); }

    // Write variable sized signed integer up to 32 bits
    wiv(n) {

        // Sign is stored in LSB and rest of number shifted one bit left
        this.wuv((Math.abs(n) << 1) | ((n < 0) ? 0x1 : 0x0));
    }

    // Write variable sized unsigned integer up to 32 bits
    wuv(n) {
        
        let byteLength = Math.ceil(Math.log2(n) / 7);
        for (let i = byteLength - 1; i >= 0; i--) {

            // Fill byte with current 7 bits
            let byte = (n >>> (i * 7)) & 0x7F;

            // Set the byte's MSB unless at last byte
            if (i != 0) byte |= 0x80;

            this.wu8(byte);
        }
    }

    // Write an ArrayBuffer or typed array of bytes
    wbytes(buffer) {

        // Convert arr to an unsigned byte array
        buffer = new Uint8Array(buffer);
        
        // Write array length
        this.wuv(buffer.length);

        // Ensure enough space is allocated for arr to be appended
        this.allocMinExtra(buffer.length);

        // Write array at position
        new Uint8Array(this.dv.buffer).set(buffer, this.pos);

        // Move position to end of array
        this.pos += buffer.length;
    }

    wutf8(str) {
        this.wbytes(new TextEncoder().encode(str));
    }
}

module.exports = {
    SerialReader,
    SerialWriter
}