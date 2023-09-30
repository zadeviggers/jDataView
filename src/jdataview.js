import { getCharCodes, wrapBuffer, arrayFrom } from "./helpers";

/**
 * jDataView provides a layer on top of the built-in `DataView` with a plethora of utilities to make working with binary data a pleasure.
 *
 * Create a `jDataView` using either `new jDataView()` or `jDataView.from()`.
 *
 * [Read the docs](https://github.com/jDataView/jDataView/wiki)
 */
export class jDataView {
	#bitOffset;
	#bytePointer;

	/**
	 * jDataView provides a layer on top of the built-in `DataView` with a plethora of utilities to make working with binary data a pleasure.
	 *
	 * [Read the docs](https://github.com/jDataView/jDataView/wiki)
	 */
	constructor(buffer, byteOffset, byteLength, littleEndian) {
		/**
		 * The jDataView instance. Can be used to check if something really is a jDataView.
		 */
		this.jDataView = this;

		if (buffer instanceof jDataView) {
			const result = buffer.slice(byteOffset, byteOffset + byteLength);
			result.littleEndian = littleEndian ?? result.littleEndian;
			return result;
		}

		/**
		 * The internal `ArrayBuffer` that jDataView is a view on
		 */
		this.buffer = wrapBuffer(buffer); // Convert strings, arrays, etc to `ArrayBuffer`s

		/**
		 * The offset in bytes from the start of the ArrayBuffer.
		 */
		this.byteOffset = byteOffset ?? 0;

		/**
		 *
		 * The number of elements in the byte array. If unspecified, jDataView's length will match the buffer's length.
		 */
		this.byteLength =
			byteLength ?? this.buffer.byteLength - this.byteOffset;

		/**
		 * The internal `DataView` that powers all the default operations like `getUint8()`
		 */
		this.dataView = new DataView(
			this.buffer,
			this.byteOffset,
			this.byteLength
		);

		/**
		 * Weather this jDataView should default to littleEndian for number operations
		 */
		this.littleEndian = !!littleEndian;

		/**
		 * The current byte pointer.
		 */
		this.#bytePointer = 0;

		/**
		 * The current bit offset.
		 */
		this.#bitOffset = 0;
	}

	/**
	 * Constructs a new jDataView filled with the provided data
	 */
	static from(...data) {
		return new jDataView(data.flat(Infinity));
	}

	#checkBounds(byteOffset, byteLength, maxLength) {
		// Do additional checks to simulate DataView
		if (typeof byteOffset !== "number") {
			throw new TypeError("Offset is not a number.");
		}
		if (typeof byteLength !== "number") {
			throw new TypeError("Size is not a number.");
		}
		if (byteLength < 0) {
			throw new RangeError("Length is negative.");
		}
		if (
			byteOffset < 0 ||
			byteOffset + byteLength > (maxLength ?? this.byteLength)
		) {
			throw new RangeError("Offsets are out of bounds.");
		}
	}

	/**
	 * Get the current byte pointer position
	 */
	tell() {
		return this.#bytePointer;
	}

	/**
	 * Get the current bit offset
	 */
	tellBit() {
		return this.#bitOffset;
	}

	/**
	 * Set the current byte pointer position
	 */
	seek(byteOffset) {
		this.#checkBounds(byteOffset, 0);
		this.#bytePointer = byteOffset;
		return this.#bytePointer;
	}

	/**
	 * Move the current pointer position forward
	 */
	skip(byteLength) {
		return this.seek(this.#bytePointer + byteLength);
	}

	/**
	 * Returns a new `jDataView` instance between `start` and `end`, optionally duplicating all the contained data in memory.
	 */
	slice(start, end, forceCopy) {
		function normalizeOffset(offset, byteLength) {
			return offset < 0 ? offset + byteLength : offset;
		}

		start = normalizeOffset(start, this.byteLength);
		end = normalizeOffset(end ?? this.byteLength, this.byteLength);

		return forceCopy
			? new jDataView(
					this.getBytes(end - start, start, true, true),
					undefined,
					undefined,
					this.littleEndian
			  )
			: new jDataView(
					this.buffer,
					this.byteOffset + start,
					end - start,
					this.littleEndian
			  );
	}

	/**
	 * Aligns the pointer (clearing any bitOffset). Can also move the pointer
	 */
	alignBy(byteCount) {
		this.#bitOffset = 0;
		if ((byteCount ?? 1) !== 1) {
			return this.skip(
				byteCount - (this.#bytePointer % byteCount || byteCount)
			);
		} else {
			return this.#bytePointer;
		}
	}

	// Setters and getters

	#getBytes(length, byteOffset, littleEndian) {
		littleEndian ??= this.littleEndian;
		byteOffset ??= this.#bytePointer;
		length ??= this.byteLength - byteOffset;

		this.#checkBounds(byteOffset, length);

		byteOffset += this.byteOffset;

		this.#bytePointer = byteOffset - this.byteOffset + length;

		const result = new Uint8Array(this.buffer, byteOffset, length);

		return littleEndian || length <= 1
			? result
			: arrayFrom(result).reverse();
	}

	#setBytes(byteOffset, bytes, littleEndian) {
		const length = bytes.length;

		littleEndian ??= this.littleEndian;
		byteOffset ??= this.#bytePointer;

		this.#checkBounds(byteOffset, length);

		if (!littleEndian && length > 1) {
			bytes = arrayFrom(bytes, true).reverse();
		}

		byteOffset += this.byteOffset;

		new Uint8Array(this.buffer, byteOffset, length).set(bytes);

		this.#bytePointer = byteOffset - this.byteOffset + length;
	}

	/**
	 * Get raw bytes. If length is undefined, it will go to the end of the buffer.
	 */
	getBytes(length, byteOffset, littleEndian, toArray) {
		const result = this.#getBytes(length, byteOffset, littleEndian ?? true);
		return toArray ? arrayFrom(result) : result;
	}

	/**
	 * Directly set raw bytes at `byteOffset` or the current pointer.
	 */
	setBytes(byteOffset, bytes, littleEndian) {
		this.#setBytes(byteOffset, bytes, littleEndian ?? true);
	}

	/**
	 * Read a string using the specified encoding, or binary if unspecified
	 */
	getString(byteLength, byteOffset, encoding) {
		const bytes = this.#getBytes(byteLength, byteOffset, true);
		// backward-compatibility
		encoding = encoding === "utf8" ? "utf-8" : encoding || "binary";
		if (TextDecoder && encoding !== "binary") {
			return new TextDecoder(encoding).decode(bytes);
		}
		let string = "";
		byteLength = bytes.length;
		for (let i = 0; i < byteLength; i++) {
			string += String.fromCharCode(bytes[i]);
		}
		if (encoding === "utf-8") {
			string = decodeURIComponent(escape(string));
		}
		return string;
	}

	/**
	 * Set a string using the specified encoding, or binary if unspecified
	 */
	setString(byteOffset, subString, encoding) {
		// backward-compatibility
		encoding = encoding === "utf8" ? "utf-8" : encoding || "binary";
		let bytes;
		if (TextEncoder && encoding !== "binary") {
			bytes = new TextEncoder(encoding).encode(subString);
		} else {
			if (encoding === "utf-8") {
				subString = unescape(encodeURIComponent(subString));
			}
			bytes = getCharCodes(subString);
		}
		this.#setBytes(byteOffset, bytes, true);
	}

	/**
	 * Get a single character.
	 * This is the same as getting a 1-length string using binary encoding
	 */
	getChar(byteOffset) {
		return this.getString(1, byteOffset);
	}

	/**
	 * Set a single character.
	 * This is the same as setting a 1-length string using binary encoding
	 */
	setChar(byteOffset, character) {
		this.setString(byteOffset, character);
	}

	#getBitRangeData(bitLength, byteOffset) {
		const startBit =
			((byteOffset ?? this.#bytePointer) << 3) + this.#bitOffset;
		const endBit = startBit + bitLength;
		const start = startBit >>> 3;
		const end = (endBit + 7) >>> 3;

		const bytes = this.#getBytes(end - start, start, true);
		let wideValue = 0;

		if ((this.#bitOffset = endBit & 7)) {
			this.#bitOffset -= 8;
		}

		for (let i = 0, length = bytes.length; i < length; i++) {
			wideValue = (wideValue << 8) | bytes[i];
		}

		return {
			start,
			bytes,
			wideValue,
		};
	}

	/**
	 * Get an integer of any bit length up to 32
	 */
	getSigned(bitLength, byteOffset) {
		const shift = 32 - bitLength;
		return (this.getUnsigned(bitLength, byteOffset) << shift) >> shift;
	}

	/**
	 * Get an unsigned integer of any bit length up to 32
	 */
	getUnsigned(bitLength, byteOffset) {
		const value =
			this.#getBitRangeData(bitLength, byteOffset).wideValue >>>
			-this.#bitOffset;
		return bitLength < 32 ? value & ~(-1 << bitLength) : value;
	}

	/**
	 * Set an unsigned integer of any bit length up to 32
	 */
	setUnsigned(byteOffset, value, bitLength) {
		const data = this.#getBitRangeData(bitLength, byteOffset);
		let wideValue = data.wideValue;

		wideValue &= ~(~(-1 << bitLength) << -this.#bitOffset); // clearing bit range before binary "or"
		wideValue |=
			(bitLength < 32 ? value & ~(-1 << bitLength) : value) <<
			-this.#bitOffset; // setting bits

		for (let i = data.bytes.length - 1; i >= 0; i--) {
			data.bytes[i] = wideValue & 0xff;
			wideValue >>>= 8;
		}

		this.#setBytes(data.start, data.bytes, true);
	}

	/**
	 * Set a signed integer of any bit length up to 32
	 */
	setSigned(byteOffset, value, bitLength) {
		return this.setUnsigned(byteOffset, value, bitLength);
	}

	/**
	 * Sets an unsigned 64 bit integer. Takes a regular Number, not a BigInt.
	 *
	 * For more precision, use `setBigUint64()`
	 */
	setUint64(byteOffset, value, littleEndian) {
		// Pointer will be handled for us by the bigInt method
		this.setBigUint64(byteOffset, BigInt(value), littleEndian);
	}

	/**
	 * Sets a 64 bit integer. Takes a regular Number, not a BigInt.
	 *
	 * For more precision, use `setBigInt64()`
	 */
	setInt64(byteOffset, value, littleEndian) {
		// Pointer will be handled for us by the bigInt method
		this.setBigInt64(byteOffset, BigInt(value), littleEndian);
	}

	/**
	 * Get an unsigned 64 bit integer. Returns a regular Number, not a BigInt.
	 *
	 * For more precision, use `getBigUint64()`
	 */
	getUint64(byteOffset, littleEndian) {
		// Pointer will be handled for us by the bigInt method
		return Number(this.getBigUint64(byteOffset, littleEndian));
	}

	/**
	 * Get a 64 bit integer. Returns a regular Number, not a BigInt.
	 *
	 * For more precision, use `getBigInt64()`
	 */
	getInt64(byteOffset, littleEndian) {
		// Pointer will be handled for us by the bigInt method
		return Number(this.getBigInt64(byteOffset, littleEndian));
	}
}
export default jDataView;

const builtInTypeBytes = {
	Float64: 8,
	Float32: 4,
	BigInt64: 8,
	BigUint64: 8,
	Int32: 4,
	Uint32: 4,
	Int16: 2,
	Uint16: 2,
	Int8: 1,
	Uint8: 1,
};

const supportedTypes = [
	...Object.keys(builtInTypeBytes),
	"Int64",
	"Uint64",
	"Signed",
	"Unsigned",
	"String",
	"Char",
	"Bytes",
];

// Encapsulate all the built-in methods
for (const type in builtInTypeBytes) {
	const typeByteLength = builtInTypeBytes[type];
	// Getters
	jDataView.prototype["get" + type] = function (byteOffset, littleEndian) {
		littleEndian ??= this.littleEndian;
		byteOffset ??= this.tell();

		// Move pointer forwards
		this.seek(byteOffset + typeByteLength);

		return this.dataView["get" + type](byteOffset, littleEndian);
	};

	// Setters
	jDataView.prototype["set" + type] = function (
		byteOffset,
		value,
		littleEndian
	) {
		littleEndian ??= this.littleEndian;
		byteOffset ??= this.tell();

		// Move pointer forwards
		this.seek(byteOffset + typeByteLength);

		return this.dataView["set" + type](byteOffset, value, littleEndian);
	};
}

// Add the the writeXXX shorthand methods
for (const type of supportedTypes) {
	// arg3 might be littleEndian or bitLength
	jDataView.prototype["write" + type] = function (value, arg3) {
		return this["set" + type].call(this, undefined, value, arg3);
	};
}
