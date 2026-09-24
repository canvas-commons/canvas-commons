# @canvas-commons/fiddle

## 0.4.0

### Minor Changes

- [#183](https://github.com/canvas-commons/canvas-commons/pull/183)
  [`b61825e`](https://github.com/canvas-commons/canvas-commons/commit/b61825e96a006dc45b270a93f272e5d0a5f8e280)
  Thanks [@hhenrichsen](https://github.com/hhenrichsen)! - Add
  `@canvas-commons/fiddle`, a browser playground runtime. It compiles a scene in
  a worker, runs it in a sandboxed iframe against vendored copies of `core` and
  `2d`, and edits it in CodeMirror with TypeScript completions and diagnostics.

### Patch Changes

- Updated dependencies
  [[`128dd9a`](https://github.com/canvas-commons/canvas-commons/commit/128dd9a62720043773c6a08c6ede62153857a015),
  [`5d2eecb`](https://github.com/canvas-commons/canvas-commons/commit/5d2eecbbafbf5715bf70a2bcda551599c7390481),
  [`56a2618`](https://github.com/canvas-commons/canvas-commons/commit/56a2618548626e235fc0facd751535a20744ea86),
  [`637a133`](https://github.com/canvas-commons/canvas-commons/commit/637a1339a6903a8e88f250f750769016c893e641),
  [`289fcb7`](https://github.com/canvas-commons/canvas-commons/commit/289fcb769ee90be554739578642e8976a64932b0),
  [`8f84c05`](https://github.com/canvas-commons/canvas-commons/commit/8f84c05d7bd156194d408b3ef1ba346a956d2de7),
  [`2d44fca`](https://github.com/canvas-commons/canvas-commons/commit/2d44fca9cf34ddb1f193ef1c656930b9d949e42d),
  [`c7c1e79`](https://github.com/canvas-commons/canvas-commons/commit/c7c1e79fa15bd540cb0236e720f1a2392c91f7c5),
  [`e86e7a8`](https://github.com/canvas-commons/canvas-commons/commit/e86e7a8e3b42f766ea546f800a118bd75c25a07a),
  [`b7c2580`](https://github.com/canvas-commons/canvas-commons/commit/b7c258029d0d56b250b5aba1064e7522bea1e8e8),
  [`b879368`](https://github.com/canvas-commons/canvas-commons/commit/b8793686125f2e8044292bd282712a6eed28404b),
  [`133b630`](https://github.com/canvas-commons/canvas-commons/commit/133b630efe326db3a5754f0564b482642febe2eb),
  [`ee46230`](https://github.com/canvas-commons/canvas-commons/commit/ee46230701d0e2080388e0fd8b09bd7d9f4d23f3),
  [`8f01f1a`](https://github.com/canvas-commons/canvas-commons/commit/8f01f1a1dc57bfb7aa1859f837efe197e56468f4),
  [`8bf9390`](https://github.com/canvas-commons/canvas-commons/commit/8bf93903ce8c5a6a42ba70cca96123eec3cc1269),
  [`ebbea2d`](https://github.com/canvas-commons/canvas-commons/commit/ebbea2d3a6cade9e28cee283b497eeffea534351),
  [`9345c4a`](https://github.com/canvas-commons/canvas-commons/commit/9345c4ab2040a25f5c34a494491f5d22662a8aea),
  [`56c7c57`](https://github.com/canvas-commons/canvas-commons/commit/56c7c576591a417c174b91abe99adedc2742fca3),
  [`476f3bb`](https://github.com/canvas-commons/canvas-commons/commit/476f3bb8de19637c52a68e91bcb72b4965dd8c22),
  [`7e8384c`](https://github.com/canvas-commons/canvas-commons/commit/7e8384cc710ecb196f06d6d0738dcb75ebdd527d),
  [`77a532c`](https://github.com/canvas-commons/canvas-commons/commit/77a532cf99bbdf879542d31cd519e4f6b51283fa),
  [`5227033`](https://github.com/canvas-commons/canvas-commons/commit/52270337309ded9a83bd6605f1aed38280c3ca52),
  [`f46dd7e`](https://github.com/canvas-commons/canvas-commons/commit/f46dd7ec3800649600d85b9e48f3e4ff914e2d13),
  [`89ab100`](https://github.com/canvas-commons/canvas-commons/commit/89ab100d806fe36f49faa0f16a176179cf5ea49c),
  [`0d54f09`](https://github.com/canvas-commons/canvas-commons/commit/0d54f09aa26457cd17ec3f7c3b4e32dfdf860ac1),
  [`049e1d8`](https://github.com/canvas-commons/canvas-commons/commit/049e1d8f7048f4d72ff26d3a30d10e29e547c75a),
  [`358fb59`](https://github.com/canvas-commons/canvas-commons/commit/358fb59d26607dce9c190926bd2154d486a3cd7f),
  [`28ffc33`](https://github.com/canvas-commons/canvas-commons/commit/28ffc3389a8905d2bb4e8ef34641f77c2ea3d662),
  [`1be94fd`](https://github.com/canvas-commons/canvas-commons/commit/1be94fd8b8317cb709efa4898234e316aae81d45),
  [`3136d86`](https://github.com/canvas-commons/canvas-commons/commit/3136d86d5151a1432912cfa153a7a8bd380ec598),
  [`0555a05`](https://github.com/canvas-commons/canvas-commons/commit/0555a053e37166f2321f1f59ba9e777fb476bda9),
  [`6c539a4`](https://github.com/canvas-commons/canvas-commons/commit/6c539a455e2f9f7487b66261f2138dbd27df6b1c),
  [`2a6f57c`](https://github.com/canvas-commons/canvas-commons/commit/2a6f57cf64ad2deb66091dc7ceed20c8685c4377),
  [`2ae5c9d`](https://github.com/canvas-commons/canvas-commons/commit/2ae5c9d666c0c5f95a5d49cf0f9a7cbee9642bbb),
  [`108537f`](https://github.com/canvas-commons/canvas-commons/commit/108537f266037fc65a62da8c3bd3f2f5e2398aa8),
  [`3d1f75a`](https://github.com/canvas-commons/canvas-commons/commit/3d1f75a93d01fa5d32bd1b7a39056d4b448d7680),
  [`9903b5a`](https://github.com/canvas-commons/canvas-commons/commit/9903b5a04bf8394c15ad2e0546e0978d4dd7ebd8),
  [`cf288c7`](https://github.com/canvas-commons/canvas-commons/commit/cf288c74cc9de19cb617781f49c69b8a154b53ef),
  [`aa0f038`](https://github.com/canvas-commons/canvas-commons/commit/aa0f038532ee5b98c17630436786e6b81eb0d874),
  [`218c20b`](https://github.com/canvas-commons/canvas-commons/commit/218c20bb35fd4084a63bea3479ea94a0c233faaf),
  [`8a38ad8`](https://github.com/canvas-commons/canvas-commons/commit/8a38ad8b0336bbd852a73a3b231a7081683cecb9),
  [`df1d210`](https://github.com/canvas-commons/canvas-commons/commit/df1d210b9136ed568229a7bd6396e1d8f195b95a),
  [`fb40013`](https://github.com/canvas-commons/canvas-commons/commit/fb400136a62a8344714c047e06e1679f30faf1e9),
  [`91b80f5`](https://github.com/canvas-commons/canvas-commons/commit/91b80f5b4da4399a52528431338b65fe1049eec8),
  [`c52fa28`](https://github.com/canvas-commons/canvas-commons/commit/c52fa28236cf62a1a706f4b522e99f6e194337d1),
  [`b879368`](https://github.com/canvas-commons/canvas-commons/commit/b8793686125f2e8044292bd282712a6eed28404b),
  [`57faadb`](https://github.com/canvas-commons/canvas-commons/commit/57faadb7297d6628fa1be5b53ccc5bb6d4d47279),
  [`ebba660`](https://github.com/canvas-commons/canvas-commons/commit/ebba660467a370ad6fc80938adb2e704429ec520),
  [`0b0301b`](https://github.com/canvas-commons/canvas-commons/commit/0b0301b1f782462d8b0b19681c2f0ebeb5328016),
  [`acb7ae4`](https://github.com/canvas-commons/canvas-commons/commit/acb7ae44bb48813a3216b04e484df8b835bf8299)]:
  - @canvas-commons/2d@0.4.0
  - @canvas-commons/core@0.4.0
