# SwfHeader

## SwfSignature

### Grammar

- _CompressionMethod_ _Uint8_ _Uint32_

## CompressionMethod

### Grammar

- `FWS`
- `CWS`
- `ZWS`

### Type

- JSON
  ```text
  enum CompressionMethod {
    "none" | "deflate" | "lzma"
  }
  ```

- Typescript
  ```typescript
  enum CompressionMethod {
    None,
    Deflate,
    Lzma,
  }
  ```
  
- Rust
  ```rust
  enum CompressionMethod {
    None,
    Deflate,
    Lzma,
  }
  ```
