;; gen-catalog.wat — the catalog generator as WebAssembly
;; render_book writes: <div class="work" data-title="TITLE"><h3>TITLE · SEAL</h3>
;; The host appends the links + meta (size, hash) after the h3.
(module
  (memory (export "memory") 1)
  (data (i32.const 0) "<div class=\"work\" data-title=\"")
  (data (i32.const 30) "\"><h3>")
  (data (i32.const 40) "\c2\b7 ")
  (data (i32.const 50) "</h3>")
  (func $copy (param $dst i32) (param $src i32) (param $n i32) (result i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store8 (i32.add (local.get $dst) (local.get $i)) (i32.load8_u (i32.add (local.get $src) (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (i32.add (local.get $dst) (local.get $n)))
  (func $copy_str (param $dst i32) (param $src i32) (param $len i32) (result i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
      (i32.store8 (i32.add (local.get $dst) (local.get $i)) (i32.load8_u (i32.add (local.get $src) (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (i32.add (local.get $dst) (local.get $len)))
  ;; entry: [tptr, tlen, sptr, slen]
  (func (export "render_book") (param $out i32) (param $entry i32) (result i32)
    (local $tptr i32) (local $tlen i32) (local $sptr i32) (local $slen i32)
    (local.set $tptr (i32.load (local.get $entry)))
    (local.set $tlen (i32.load (i32.add (local.get $entry) (i32.const 4))))
    (local.set $sptr (i32.load (i32.add (local.get $entry) (i32.const 8))))
    (local.set $slen (i32.load (i32.add (local.get $entry) (i32.const 12))))
    (local.set $out (call $copy (local.get $out) (i32.const 0) (i32.const 30)))
    (local.set $out (call $copy_str (local.get $out) (local.get $tptr) (local.get $tlen)))
    (local.set $out (call $copy (local.get $out) (i32.const 30) (i32.const 6)))
    (local.set $out (call $copy_str (local.get $out) (local.get $tptr) (local.get $tlen)))
    (if (i32.gt_u (local.get $slen) (i32.const 0))
      (then
        (local.set $out (call $copy (local.get $out) (i32.const 40) (i32.const 3)))
        (local.set $out (call $copy_str (local.get $out) (local.get $sptr) (local.get $slen)))))
    (call $copy (local.get $out) (i32.const 50) (i32.const 5))))
