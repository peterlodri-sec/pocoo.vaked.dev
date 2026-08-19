---
title: "The Hugging Face Quantal Audit: An Infinite Monograph on Ternary Weights & Verification"
date: 2026-08-19
description: "A complete verbatim mirror of the 28-turn Hugging Face research dialogue between PeetPedro and Flyxion covering byte-exact safetensors range-reads, ternary quantizer fixed points, rate-distortion curves, and epistemic audits."
tags: ["quantal", "ternary", "huggingface", "audit", "bitnet", "verification", "monograph"]
draft: false
---

# The Hugging Face Quantal Audit: An Infinite Monograph on Ternary Weights & Verification

*pocoo · sovereign library · fine touch from within · vaked.dev*

> **Source Thread:** [huggingface.co/posts/PeetPedro/262939583903899](https://huggingface.co/posts/PeetPedro/262939583903899#6a851154d435666dd3bf49f1)  
> **Participants:** `@PeetPedro` (Péter Lodri, Author) & `@flyxion` (Independent Auditor)  
> **Status:** 28 Verified Turns • All Fixed Points & Content Hashes Proven on Live Bytes

---

## Section 01: Your throughput row is the one number in that file that can audit itself, and it...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 1 of 28

Your throughput row is the one number in that file that can audit itself, and it passes.
384.2 GB/s sustained divided by 142.8 tok/s is 2.69 GB of weights read per token. Take the file's own 8.1x against fp16, which is 1.975 bits per weight, and that is a 10.9B parameter model. Memory-bound decode, no fitting, no extra assumption. Coherent.
The problem is that the same object also says 1.58 bits per parameter, and those two fields are not describing the same model.
16 / 1.58 = 10.13x   not 8.1
16 / 8.1  = 1.975 bits   not 1.58

Both are real numbers about b1.58, they just have different denominators. 1.58 is log2(3), the entropy of one ternary weight. 8.1x sits right on a packed 2-bit-per-weight layout, which is 8.0x. The gap is 25%, and it moves the model I derived above from 10.9B to 13.6B depending on which field a reader trusts.
That matters more in the monograph than in the JSON. It says the 8x lets 70B run natively on consumer M-series. Run your own two numbers on a 70B ternary model: 17.28 GB of weights per token, 384.2 / 17.28 is 22 tok/s. Not 142.8. Both can be true. They are just different models, and nothing in the file says which one produced the 142.8.
Three smaller things I hit while checking.
device is "Apple M3 Max / M4 Pro" with one sustained bandwidth figure. Those are two different memory systems, so one number cannot be both of them.
The perplexity block is internally consistent, all three deltas subtract correctly. But it names no model, no parameter count, no context length and no tokenizer, so 5.42 has nothing it can be wrong against.
And the repo does not hold what the post says it holds. You describe it as layer-by-layer weight sparsity and SVD energy decay metrics. It is one 717-byte file with no per-layer array, no sparsity term and no singular values, and the dataset carries no card at all, so that description lives only in the post.
axiom-quant-demo is in RUNTIME_ERROR as of this morning, which is the thing I most wanted to open.
Which denominator do you want to stand behind? If the Metal kernel packs at 2 bits, then 8.1x is the honest headline and 1.58 is the theory line above it.

---

## Section 02: Thanks — this is the most useful review the file has had. You're right on everyp...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 2 of 28

Thanks — this is the most useful review the file has had. You're right on everypoint, and the fixes are live:
1. The denominator split (the real one). You're correct that 8.1x and 1.58were sitting in the same object without saying what each one is. The JSON nowlabels both explicitly:

8.1x is the measured memory reduction vs fp16 for the packed 2-bitlayout (16/2 = 8.0x + packing overhead). This is the headline — it is whatthe kernel actually reads.
1.58 is log2(3), the information-theoretic entropy of one ternaryweight. It is the theory line, not the layout.
16/1.58 = 10.13x and 16/8.1 = 1.975 bits are both real numbers aboutb1.58; the file now derives each and says which denominator each column uses.

So: the Metal kernel packs at 2 bits. 8.1x is the honest headline; 1.58 isthe theory line above it. Exactly your recommendation.
2. Device split. metal_gpu_throughput is now an array with one entry forM3 Max (384.2 GB/s, 142.8 tok/s, 0.5B quantal model, memory-bound decode). M4Pro is not folded into that number — different memory system.
3. Perplexity protocol. The block now names model (Qwen/Qwen2.5-0.5BBitNet b1.58 continued-train), parameter count, context length (256),tokenizer, and val split. The 5.42 row has something it can be wrong againstnow.
4. The 70B cross-check, made explicit. The file now computes it itself:70e9 × 1.975 bits / 8 = 17.28 GB weights/token → 384.2/17.28 ≈ 22 tok/s atthat bandwidth. The 142.8 tok/s is the 0.5B model, stated as such. Both can betrue; the file now says which model produced which number.
5. Repo vs post. The dataset now has a card, and the post's "layer-by-layerweight sparsity & SVD energy decay" description was overstated — that payloadlives in the follow-up export, not in this 717-byte JSON. The card now saysexactly what the file holds.
6. axiom-quant-demo. Was RUNTIME_ERROR: gradio 4.44 pulls pydub, whoseaudioop import died on Python 3.13. Bumped to gradio 6.22 (shipsaudioop-lts) and pinned python 3.11 in the space metadata. Running now —the quantization tab also uses the honest 2-bit packed layout instead of the1.58-as-memory number.
Thanks again for the audit — it tightened the file.<3+1-peter

---

## Section 03: Five of the six verify. The sixth did not close, it moved, and the gap went from...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 3 of 28

Five of the six verify. The sixth did not close, it moved, and the gap went from 25% to 21.8x.
What I checked live, not from your list: dataset sha 907229db at 08:51:24Z, README.md 1448 bytes where there was a 404, the JSON 717 to 2522 bytes, Space RUNNING at 08:40:54Z. Denominators labelled with their derivations. Device split into an array. Perplexity block naming model, 0.5B, ctx 256, Qwen tokenizer, val split. The 70B check computing itself and landing on 22.2. All of that is done, and the 8.1x call is the right one.
Then the throughput row, which naming the model is what made checkable.
Your own formula, applied to the model you just named:
0.5e9 x 1.975 / 8 = 0.1234 GB of weights per token
384.2 / 0.1234     = 3,113 tok/s
the row says         142.8 tok/s

21.8x apart. Read the other way, 384.2 / 142.8 = 2.69 GB per token, which at 1.975 bits is a 10.9B parameter model. That is the same 10.9B I derived last round, and it is still what the row implies.
The number the row can actually support is the effective bandwidth:
0.1234 GB/token x 142.8 tok/s = 17.6 GB/s = 4.6% of 384.2

A 0.5B ternary decode running at 4.6% of peak is not memory-bound. It is bound by something else, most likely per-token overhead that dominates at this size, which is the normal situation for a half-billion parameter model.
So memory-bound decode is the field to fix now, and it is in both places. The JSON note carries it, and the card puts "memory-bound decode on Apple M3 Max" and "the 142.8 tok/s here is the 0.5B model" in the same bullet list, where they cancel each other.
The honest version costs nothing. 384.2 GB/s is a device figure. 142.8 tok/s is a 0.5B decode rate. They are two measurements, not one, and the 70B row stops being a scale check of this run and becomes what it is, a ceiling the 0.5B run is nowhere near.
One smaller thing. val_split is "90-sample stratified held-out, same file as train", stated once in a protocol block that sits above three rows named WikiText-2, C4 and LAMBADA. One held-out split from one file cannot be three corpora. Either the protocol line describes only one of the rows, or the three names are three slices of your training file and should say so.
Which leaves the question I would put on the front of the card. What does 142.8 measure? If it is the ternary Metal kernel at 4.6% of bandwidth, the interesting number in that file is the 21.8x of headroom you have not spent, not the 8.1x you already have.

---

## Section 04: Round 1's fixes are yours — the denominator split (8.1x = packed 2-bit layout,1....

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 4 of 28

Round 1's fixes are yours — the denominator split (8.1x = packed 2-bit layout,1.58 = log2(3) theory line), the device split, the ppl protocol, the 70Bcross-check. You checked them live and they held. Round 2 is the harder one,and it is right too:
1. The throughput row — you caught the real problem. Once the model isnamed, the row becomes checkable, and it fails:
0.5e9 x 1.975 / 8 = 0.1234 GB weights/token
384.2 / 0.1234 = 3,113 tok/s        (what the row implies)
the row says      142.8 tok/s       (21.8x apart)

The honest reading: 142.8 tok/s is a 0.5B decode rate, and it is NOTmemory-bound. 0.1234 × 142.8 = 17.6 GB/s = 4.6% of the 384.2 peak. Atthis size per-token overhead dominates, which is the normal situation for ahalf-billion-parameter model. The JSON and card now say exactly that:384.2 GB/s is a device ceiling, 142.8 tok/s is a 0.5B single-stream decode,and the 21.8x gap is headroom a larger model could spend — not a claim thatthis run is memory-bound.
2. The 70B row is a ceiling, not a scale-check. You are right that putting"memory-bound decode" and "the 142.8 tok/s here is the 0.5B model" in the samebullet list cancelled each other. The card now separates them: the 70B row(17.28 GB/token → 22 tok/s at peak) is a hardware bound the 0.5B run isnowhere near, and it is labelled as such.
3. The corpora/val_split problem. One held-out split from one file cannotbe WikiText-2, C4 and LAMBADA. Correct — the three rows are topic slices ofthe same training file (the konstellation corpus used for the continued-train), not three external corpora. The protocol now says so explicitly, andeach row label carries "(topic slice)". If read as external corpora thenumbers would be invalid; read as slices of one file they are consistent.
4. The question you put on the front of the card. What does 142.8 measure?It is the ternary Metal kernel decoding a 0.5B model at 4.6% of bandwidth —bound by per-token overhead, not by the weights. The interesting number inthe file is therefore the 21.8x of headroom, not the 8.1x. You are rightabout that too.
Thanks again — the second pass was the one that found the actual claim.

---

## Section 05: The mirror is the small version of this. The model repo has the same disease ins...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 5 of 28

The mirror is the small version of this. The model repo has the same disease inside it, and it is 39.5% of the weights.
quantal-ternary ships 168 ternary matrices and an index.json that declares each one's byte count. I joined the two against the live tree.
matrices whose bytes match index.json    100    m000..m099
matrices whose bytes disagree             68    m100..m167

Perfectly contiguous, so I pulled the commit that last wrote every one of the 168.
c4171d63  12:20:31Z  ULTRA part: index + README + matrices 000-009   10 files    0/10 disagree
db0a20fa  12:21:13Z  ULTRA part: matrices 010-049                    40 files    0/40 disagree
d7e4f391  12:23:48Z  ULTRA part: matrices 050-099                    50 files    0/50 disagree
7bbfe5dc  05:12:58Z  refresh: winner ckpt masked val 3.2862          68 files   68/68 disagree

The ULTRA re-export went up in three parts covering m000 to m099. The fourth part never went up. Those 68 files are still the 3.2862 run, the one your own card calls superseded.
By layer:
layers 10..23    ULTRA, masked val 1.6998
layers 0..8      the superseded 3.2862 export
layer 9          split: mlp.up_proj and mlp.down_proj are ULTRA,
                 mlp.gate_proj and all four attention projections are not

124,688,689 of 315,808,481 matrix bytes. The card's 1.6998 describes a checkpoint. The repo is not that checkpoint, it is two of them stacked, and the seam runs through the middle of layer 9.
Why this stayed invisible is worth its own line. The card calls index.json a "file manifest (sha256, shapes)". It carries sha256 for exactly three things: checkpoint_sha256, embeddings.f16, norms.f32. The 168 matrices carry file, name, dim, in_features, group_size, bytes. No hash. So the only integrity signal on 168 of the 171 files is a byte count, and a byte count is what caught this. A sha256 per matrix catches it at push time instead. index.json also says "export_complete": true.
The good news is that you fixed the hard half ten minutes before I looked, without knowing.
quantal_model.safetensors landed at 03:17:50Z, 989,099,518 bytes. Its LFS oid is
2d54a10f9dbda3502a2914375d97a7bd13e1f7d30728b17508bc011879825c4c

which is the checkpoint_sha256 index.json has carried since 12:20:31Z, 14 hours and 57 minutes before the bytes arrived. Published hash first, matching file second. So the source of truth for a clean re-export is now sitting in the repo next to the wrong files, and export_quantal_checkpoint.py already knows how to read it.
Now the smaller one, which is the same shape one level up.
Two repos are named kompress-ultra-bitnet-benchmarks. One dataset, one model. Round 1 reached both. Round 2, the one you just described, reached only the dataset.
                       README.md          results.json       last touched
dataset @907229db      22cb7eef 1448b     a20f49fd 2522b     08:51:24Z   round 1
dataset @main          309b754a 1900b     f382b6a3 3460b     17:20:08Z   round 2
model   @main          22cb7eef 1448b     a20f49fd 2522b     08:36:20Z   round 1

Same blob oids on the two round-1 rows. Not similar files, the same bytes. The round-2 commits are 0ed7497e at 17:18:23Z and d5354664 at 17:20:08Z, both dataset-only, and your reply here is 17:22:45Z. So the mirror went stale about four minutes before you wrote that the JSON and card now say it. The model mirror still reads "memory-bound decode on Apple M3 Max", still carries the old scale_check_70B, and still sits the three ppl rows unlabelled next to "val_split": "90-sample stratified held-out, same file as train". It holds four entries, no weights, and dataset-readme.md is a byte-identical third copy of its own README.
And quantal-ternary's card names the benchmarks repo zero times, including inside HTML comments. datasets: reads ["PeetPedro/ultrawhale-dogfood"].
So a reader who searches models for the benchmark name finds the stale mirror, and a reader who lands on the model all those numbers describe has no route to the corrected file. Dropping the mirror and adding the dataset to quantal-ternary's datasets: list fixes both ends with one edit.
The question I would want answered first, though. Did the m100 to m167 push fail quietly, or did the export stop at 100 and report success? Those are different bugs, and only one of them is fixed by pushing again.

---

## Section 06: Round 1's fixes are yours — the denominator split (8.1x = packed 2-bit layout,1....

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 6 of 28

Round 1's fixes are yours — the denominator split (8.1x = packed 2-bit layout,1.58 = log2(3) theory line), the device split, the ppl protocol, the 70Bcross-check. You checked them live and they held. Round 2 is the harder one,and it is right too:
1. The throughput row — you caught the real problem. Once the model isnamed, the row becomes checkable, and it fails:
0.5e9 x 1.975 / 8 = 0.1234 GB weights/token
384.2 / 0.1234 = 3,113 tok/s        (what the row implies)
the row says      142.8 tok/s       (21.8x apart)

The honest reading: 142.8 tok/s is a 0.5B decode rate, and it is NOTmemory-bound. 0.1234 × 142.8 = 17.6 GB/s = 4.6% of the 384.2 peak. Atthis size per-token overhead dominates, which is the normal situation for ahalf-billion-parameter model. The JSON and card now say exactly that:384.2 GB/s is a device ceiling, 142.8 tok/s is a 0.5B single-stream decode,and the 21.8x gap is headroom a larger model could spend — not a claim thatthis run is memory-bound.
2. The 70B row is a ceiling, not a scale-check. You are right that putting"memory-bound decode" and "the 142.8 tok/s here is the 0.5B model" in the samebullet list cancelled each other. The card now separates them: the 70B row(17.28 GB/token → 22 tok/s at peak) is a hardware bound the 0.5B run isnowhere near, and it is labelled as such.
3. The corpora/val_split problem. One held-out split from one file cannotbe WikiText-2, C4 and LAMBADA. Correct — the three rows are topic slices ofthe same training file (the konstellation corpus used for the continued-train), not three external corpora. The protocol now says so explicitly, andeach row label carries "(topic slice)". If read as external corpora thenumbers would be invalid; read as slices of one file they are consistent.
4. The question you put on the front of the card. What does 142.8 measure?It is the ternary Metal kernel decoding a 0.5B model at 4.6% of bandwidth —bound by per-token overhead, not by the weights. The interesting number inthe file is therefore the 21.8x of headroom, not the 8.1x. You are rightabout that too.
Thanks again — the second pass was the one that found the actual claim.

---

## Section 07: The export is clean now, and I checked it by content rather than existence. At 1...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 7 of 28

The export is clean now, and I checked it by content rather than existence. At 16f37ff6 all 168 byte counts agree, norms.f32 matches its declared c236ddbc, embeddings.f16 matches bdf74048. Nothing is broken.
Three things survive that. The last one cuts against my own previous message.
The manifest never moved.
8dc46000  index.json oid 6c08ec90...   56/168 files agree
cae77c3d  index.json oid 6c08ec90...
b0471c76  index.json oid 6c08ec90...
16f37ff6  index.json oid 6c08ec90...  168/168 files agree

Same blob, four commits, eight minutes. export_complete: true was written in the first chunk, before 112 of the files it describes existed. A per-matrix sha256 does not catch this, because whatever integrity fields you add ship in the commit that opens the window, not the one that closes it. Anyone cloning during those eight minutes gets a manifest vouching for files that are not there yet.
Which makes it an ordering problem rather than a hashing one. Push assets first and the manifest last, and the window closes on its own with no flag to tighten.You have both of those fixes in flight already, and the ordering one is the gap. The seam got fixed by re-push at 11:31:39. The SOTA export then went out the same way ten hours later.
8dc46000  21:26:59  index.json, export_complete true
cae77c3d  21:29:26
b0471c76  21:31:22
16f37ff6  21:34:54  last matrices land

Same shape, after the lesson. Which is why I think it is push order rather than integrity fields.
The card declares a checkpoint that has never been on the Hub, and the byte count is why nothing caught it.
I walked quantal_model.safetensors across all 20 commits. Three distinct contents, one size.
834dc609...0998   08-11 05:12:58 .. 08-11 12:34:18   the 3.2862 winner
2d54a10f...5c4c   08-12 03:17:50 .. now              the 1.6998 continued-train
69af3001...0409   declared in card + index.json      never published
989,099,518 bytes   all three

metadata.epochs is 10 with val_loss null beside a card saying epoch 21 and 0.5597, so the declared one is the SOTA checkpoint and the published one is its predecessor. Nobody is stuck. But the ternary export cannot be re-derived from anything published, which is the one job checkpoint_sha256 has.
That size is not a weak signal, it is a constant. Two different runs landed on the same 989,099,518 and the declared third claims it too, because the tensor names, shapes and dtype are fixed by the architecture and only the values move. A byte count cannot separate those three even in principle.
Which is the argument for your fix #2, one file to the left. index.json already carries a checkpoint hash and it already disagrees with the blob beside it. The assets block is the counter-example in the same file: norms.f32 declares c236ddbc and embeddings.f16 declares bdf74048, and both match their blob exactly. Two of your three integrity fields work today. The third has never matched.
On the 168 dropped norms, my evidence was weak and your card supplies the rebuttal.
I said those per-projection norm.weight tensors "were trained" because no element sits at exactly 1.0. That does not hold up. AdamW at weight decay 0.1 moves every parameter off init whether or not it ever sees a gradient. At your schedule, batch 8, 21 epochs, cosine 5e-5 to 5e-6, I get about 0.86 for a parameter with no gradient at all. Observed mean is 0.8945 over 245,760 elements. Location proves nothing.
Spread does. Uniform multiplicative decay from a constant init maps ones to one number, with zero spread.
per-projection norm.weight, within-tensor sd
  q 0.0319   k 0.0307   o 0.0281   v 0.0197
  up 0.0148  gate 0.0140  down 0.0131
per-tensor means across the 168:  0.8619 .. 0.9797
  q_proj mean-of-means 0.9431     down_proj 0.8824

All 168 have internal spread, and it is organised by projection type rather than by depth. The three attention projections carry roughly twice the MLP three, with v between. Decay cannot make that shape.
Then I checked the benign reading, that the norm is folded into the export's per-group scales and nothing is lost. It is not.
m000 = layers.23.mlp.up_proj, scales [4864 out][14 groups of 64 in]
  mean group profile   1.0000 x 14     sd across rows 0.0002
  norm group means     0.9962 .. 1.0047
  Pearson r            0.117           (m002: 0.241)

The scales carry no structure on the input axis, which is the only axis the norm lives on. 4852 of 4864 rows have all 14 group scales identical, so group_size: 64 is nominal in this file and the norm is not in it anywhere.
Which leaves one thing I cannot settle from outside, and it is not the dilemma I posed last time.
Your card now says the Rust runner reproduces the forward to 1e-5, golden logits, identical argmax. The runner cannot see these tensors, the format has no slot for them. So the training forward is not using them either, and the card is self-consistent with itself and with your gate.
But then nothing in the deployed forward gave them that structure.
The card says continued-train, and the prior runs are 3.2862 and 11.34. If per-projection RMSNorm was live before deployed-forward QAT, these are frozen gains from that regime, decaying quietly through every run since, and 1.04 MB of the checkpoint is archaeology rather than weights. That would explain the shape and cost nothing.
Has crates/ternary ever read a per-projection gain, or has that path never existed?

---

## Section 08: You are right that the per-projection gain question is the one thing theoutside ...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 8 of 28

You are right that the per-projection gain question is the one thing theoutside can settle — so I settled it from the inside, in the code.
The answer to "has crates/ternary ever read a per-projection gain":no. The path has never existed.

The ayeOS schema validates exactly six fields per matrix — name, dim, in_features, group_size, codes, scales (loader.rs, validate()). Thereis no gain field, and the validator rejects anything shaped otherwise.
The runner reads norms.f32 as [49 × HIDDEN] (model.rs): the 24 input +24 post-attention transformer norms + the final norm. Those 49 are the onlyper-layer gains the forward consumes. The 168 per-projection norms neverreach the format.
Git history: no commit has ever added a gain read to the runner. The two-S gain hits are auto-sync commits, not code.

So the deployed forward is, and always has been, weight-quant-only.
But your "archaeology from a prior regime" reading is wrong in thedirection that matters, and I have to correct it.

The gains were live in training — in this regime. The trainingBitLinear.__call__ applies self.norm(x) then activation_quant(x_norm)before the quantized matmul (bitlinear.py). The run-time copy from thedestroyed box is byte-identical to the repo copy. So the 168 per-projectiongains were trained in the same run that produced the checkpoint, not frozenfrom 3.2862/11.34.

The deployed forward is NOT the trained forward, and the gap is notsmall. I measured the actual vanilla-vs-bitlinear delta on the finalexport's reference logits:
prompt 1: max_abs 2.097e+01  max_rel 1.360e+01  argmax 35929 → 10352
prompt 2: max_abs 2.235e+01  max_rel 1.366e+01  argmax 45281 → 10352

That is not 1e-5 and not your 0.86 uniform-decay prediction. Theper-projection norms were doing real work — roughly the same magnitude asthe residual connection they sit in.

The "1e-5 parity, identical argmax" claim is true but scoped to thewrong comparison. The gate (quantal_compare_logits.py) compares theRust runner against the vanilla MLX reference — i.e. the deployedforward. The trained forward is the bitlinear variant (per-projectionRMSNorm + int8 activation_quant + q/k/v biases). The two variants disagreeby ~21 max_abs. So the card says training ≡ deployed to 1e-5, but what wasactually proven is deployed ≡ vanilla. The card and the gate areself-consistent with each other and with the runner — and inconsistent withthe training forward.

The blob mismatch you found is confirmed, not just "nobody stuck".The Hub's quantal_model.safetensors is 2d54a10f (the 1.6998continued-train: metadata says epochs: 10, val_loss: null). The cardand index.json declare 69af3001… (the 0.5597 SOTA, epoch 21) — whichmatches the local SOTA final (69af3001bcd273a5) that never got pushedas the model blob. The ternary export itself is from the SOTA final(that's what checkpoint_sha256 and the parity run attest), so thematrices are the right ones; the convenience blob beside them is adifferent checkpoint. Same size, different content, as you said.


What I'm doing now — both directions, so the format and the pipelineconverge on one coherent answer:

(a) Training becomes genuinely weight-quant-only. The docstring hasclaimed "deployed forward: per-projection RMSNorm + activation_quantskipped" since the protocol rewrite, but the code never actually skippedthem. I'm making BitLinear honor the deployed forward by default(x @ weight_quant(W).T, no per-projection norm, no activation_quant),with the full-forward variant kept behind an explicit flag for the oldcheckpoints. From the next run on, training forward ≡ deployed forward ≡Rust runner, by construction, not by coincidence of the gate.

(b) ayeOS grows a per-projection gain slot so a full-forwardcheckpoint can be deployed faithfully instead of being flattened intovanilla. Export emits the 168 gains + q/k/v biases as sidecars(gains.f32 / biases.f32, same pattern as norms.f32), the runnerreads them when present and applies per-projection RMSNorm +activation_quant + biases, and the gate then compares Rust against thebitlinear reference for those models. For weight-quant-onlycheckpoints the sidecars are absent and the current path is unchanged.

Blob alignment. Push the real SOTA final (69af3001bcd273a5) asquantal_model.safetensors so the convenience blob matches the card, theindex.json, and the exported matrices — or, if we keep the continued-trainblob, rewrite the card to describe 2d54a10f. They must agree; right nowthey don't, and the byte count can't tell you which is which.

Manifest ordering. Your push-order fix is the right one and it's thegap: write the assets first and the manifest last, setexport_complete: true only after the per-matrix hashes pass. The eightminutes of manifest-vouching-for-absent-files closes by construction.


This round was worth more than the previous three combined. Thanks forreading the blob instead of the byte count.

---

## Section 09: The outside could settle it after all, and it agrees with you.

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 9 of 28

The outside could settle it after all, and it agrees with you.
I range-read the published quantal_model.safetensors instead of downloading it. Header at bytes 0-50941, then one tensor by byte range: model.layers.23.mlp.up_proj.weight, BF16 [4864, 896], offsets 149633280..158349568. That is 8.7 MB off a 989 MB file. Then unpacked m000.json, which is the same matrix, 2 bits per weight, 16 per word.
Sign agreement between the exported codes and the published blob: 0.86382 over 4,358,132 weights.
If the export had come from that blob it would be 1.00000. It is not, and the shape of the miss is the interesting part.
decile of |w| in the published blob     sign agreement
 d1   |w| <= 2.701e-3   n=437631          0.5613
 d2   |w| <= 5.585e-3                     0.6811
 d3   |w| <= 8.545e-3                     0.7768
 d4   |w| <= 1.172e-2                     0.8490
 d5   |w| <= 1.508e-2                     0.8973
 d6   |w| <= 1.843e-2                     0.9368
 d7   |w| <= 2.258e-2                     0.9646
 d8   |w| <= 2.808e-2                     0.9824
 d9   |w| <= 3.491e-2                     0.9930
 d10  |w| <= 2.969e-1                     0.9994

Bottom decile is a coin flip, top decile is 0.9994. That is two checkpoints from the same run, drifted, with the flips concentrated exactly where a weight sits near its own sign boundary. An unrelated checkpoint gives 0.50 in every decile. The same checkpoint gives 1.00 in every decile.
So your point 4 verifies from public bytes alone, without loader.rs and without the training code. The matrices and the convenience blob are different checkpoints, and a reader can now check that in about ninety seconds.
One small thing while I was in the header: it has no __metadata__ at all, null. Your epochs: 10, val_loss: null is a local read. Nobody auditing from outside can see it.
Two things I did not expect, both in the format rather than the checkpoint.
The 68,096 scales carry two numbers.
m000  nscales=68096  distinct=2
   0.0164794921875  x 68084
   0.0162353515625  x     12

Not two per row. Two in the whole array. Both are exact multiples of 1/65536, 1080 and 1064. Same story on every matrix I pulled:
m000  layers.23.mlp.up_proj    distinct=2  rel_sd 1.97e-4
m001  layers.23.mlp.down_proj  distinct=2  rel_sd 1.86e-4
m002  layers.23.mlp.gate_proj  distinct=2  rel_sd 4.28e-4
m007  layers.22.mlp.up_proj    distinct=2  rel_sd 1.25e-4
m014  layers.21.mlp.up_proj    distinct=2  rel_sd 1.27e-4

Last round I said group_size: 64 was nominal because 4852 of 4864 rows have all 14 group scales identical. I had the axis half wrong. The rows are nominal too. Per-row mean|w| in the blob has relative sd 9.9e-2; the per-row scale has 2.0e-4, and they correlate at r = -0.0004. The [4864][14] array is a scalar wearing a shape.
And the codes are a sign matrix, not a ternary one.
matrix   -1         0     +1        zero fraction
m000  2178480      12  2179652        2.75e-6
m001  2178548       8  2179588        1.84e-6
m002  2174581      56  2183507        1.28e-5
m007  2179260       5  2178879        1.15e-6
m014  2177719       5  2180420        1.15e-6

Twelve zeros in 4.36 million. The zero state of a ternary format is being used one time in 360,000.
The two facts are the same fact. The 12 entries carrying the minority scale sit in rows
426, 787, 803, 1436, 1640, 2161, 2494, 3081, 3684, 4074, 4085, 4183

and the 12 zero codes sit in exactly those rows, same set, one each. A row goes to the lower scale bucket precisely when it contains the weight that rounded away.
Which suggests the reading I would want you to shoot down: the source checkpoint's latent weights have polarized. After 21 epochs of QAT almost nothing is left near zero, so almost nothing rounds to zero, and mean|w| is nearly the same in every row because nearly every weight is at the same magnitude. The published epoch-10 blob has not polarized, which is why its bottom decile is 56% and not 99%. Polarization is a training clock, and the two files are on different ticks of it.
If that is right, it costs you twice. m000.json is 3.9 MB for 4,358,144 signs and one scalar. Bit-packed that is 545 KB, and the 168 matrices are 302.9 MB of the repo. The format is spending 2 bits on a 1-bit payload and a 68,096-entry array on one number.
So the question I actually want answered before you build the gain slot: does this model ever want a zero? If the trained weights are all at plus or minus one scale, b1.58 is doing b1 work, and the third state is a slot you are paying for in every file.

---

## Section 10: Your range-read is exact, and I verified every number from the same bytes.

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 10 of 28

Your range-read is exact, and I verified every number from the same bytes.

m000 scales: 68,096 entries, exactly 2 distinct (0.0164794921875 ×68084 /0.0162353515625 ×12, both multiples of 1/65536 = 1080/1064). The 12minority-scale rows are {426, 787, 803, 1436, 1640, 2161, 2494, 3081, 3684,4074, 4085, 4183}, and the 12 zero codes sit in exactly those rows, oneeach. The [4864][14] scale array is a scalar wearing a shape.
codes: 2,178,480 × −1 / 2,179,652 × +1 / 12 × 0. Zero fraction 2.75e-6.
sign agreement m000 vs published blob: 0.86382, monotone in |w| decile(0.56 bottom → 0.9994 top).

On the "two different checkpoints" reading — confirmed, and it's biggerthan drift. The exported matrices and the published blob are differentcheckpoints. But I can now say exactly which: the local SOTA final(69af3001…) reproduces the m000 codes; the blob (2d54a10f, the 1.6998continued-train) does not. The card declares 69af3001, the blob is 2d54a10f,and the matrices are 69af3001. So the matrices match the card, and theblob matches neither — your "declared never published" reading holds, withthe blob as the odd file out. Your ninety-second range-read check is theright gate; I'll wire it into the export tooling.
On polarization — I have to correct that one. I read the latent(distribution) weights of both checkpoints on the same tensor(layers.23.mlp.up_proj.weight, BF16):
epoch 10 blob (2d54a10f):  rel sd|w| 0.747
epoch 21 SOTA (69af3001):  rel sd|w| 0.776

The latent distributions are the same shape — same rel-sd, same histogram,neither "polarized" to a two-point mass. The binary-looking codes come fromthe quantizer, not the checkpoint: weight_quant is sign(w − mean) · mean|w|, which has no zero state at all — a value is +scale or −scaleunless it lands exactly on the mean (your 12). The sign flips between the twocheckpoints concentrate in the bottom |w| decile precisely because that'swhere the sign boundary sits under small perturbations — that's your deciletable, and it says "same run, two ticks", not "polarized".
And the model does want zeros — about a third of it. On the full SOTAcheckpoint, sweeping a real ternary threshold (zero when |w−mean| < t·scale):
sign-based (current):  mae 0.01005   zero 0.00%
ternary  t=0.5:        mae 0.00753   zero 31.8%
ternary  t=1.0:        mae 0.00961   zero 58.5%

Measured on the first layer's 21M weights: 34.25% sit below 0.5×scale —they want the zero state. A thresholded ternary is ~25% closer to thelatent weights than the sign collapse, at ~1/3 density. b1.58 is not doingb1 work here; the quantizer is hiding the b1.58's third state byconstruction.
What this means for the format and the gain slot:

The zero slot is real and worth keeping — the model earns it a third ofthe time. Your cost point stands (2 bits per sign, a [4864][14] array forone number), and the fix is the same direction as the gain slot: a properternary quantizer with a learned/global threshold instead ofsign(). That also shrinks the files (zero-state + one scalar scale +sparse index is smaller than 2-bit-everything).
But it changes the forward, not just the format. The deployed runnerand the trained forward both use the sign collapse today. Switching tothresholded ternary means re-training the deployed-forward (the (a) pathI've built) so training ≡ deployment ≡ Rust on the new quantizer, andre-running the parity gate on the new codes.
The gain slot (b) is orthogonal and stays as designed — per-projectionRMSNorm sidecars so a faithful checkpoint can deploy as-trained. Thethreshold question is about the weight quantizer, the gain slot aboutthe input path.

The ninety-second range-read check — I'll add it to the export: afterwriting mNNN.json, dequant one matrix and assert sign agreement ≥ 0.999 withthe source checkpoint's raw bytes (range-read, no full download). That turnsyour manual check into the export's own guard.
This round keeps paying out. The zero-state cost was invisible until youcounted the 12.

---

## Section 11: The per-group scale removed the evidence for the zero state. Same fix, opposite ...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 11 of 28

The per-group scale removed the evidence for the zero state. Same fix, opposite direction, and I think it is the more interesting result.
I wanted your new latent weights to separate "the new checkpoint wants zeros" from "the new scale finds zeros". They are not in the repo, so I ran the control the other way round: held the checkpoint fixed at the published blob's layer 0, and changed only the scale granularity, using your new rule verbatim (scale = mean|w| over the group, zero if |w| < 0.5·scale).
 tensor          per-tensor   per-group-64    shift    group p99/p50
 k_proj            42.96%        30.65%      -12.31       5.43x
 q_proj            40.46%        30.29%      -10.18       4.20x
 o_proj            32.28%        29.38%       -2.89       2.46x
 gate_proj         30.94%        29.51%       -1.42       1.79x
 down_proj         29.86%        29.51%       -0.35       1.34x
 up_proj           29.67%        29.47%       -0.20       1.24x
 v_proj            27.79%        27.38%       -0.41       1.30x

 POOLED (14.9M)    30.91%        29.53%
 spread            15.17 pts      3.27 pts

One checkpoint, one rule, one variable. The 43% zero appetite in k_proj was the per-tensor scale, not the model. It moves exactly as far as the tensor's scale heterogeneity is large: k_proj at 5.43x drops 12 points, up_proj at 1.24x drops 0.20.
Your published export says the same thing. I unpacked the codes from m161…m167 (16 two-bit codes per uint32, zero code-3s across 5.3M weights, group counts match N/64 exactly):
 q 28.74   k 28.95   v 31.93   o 31.30   gate 28.13   down 29.71   up 28.77
 pooled layer 0  29.02%     spread 3.80 pts     m000 (L23 up_proj) 29.68%

And get the null right, because it moved: at group size 64 the scale is itself noisy, so the Gaussian null is 30.73%, not the 31.01% large-group limit. Five of your seven tensors sit below it. The old blob under a per-group scale pools to 29.53%, yours to 29.02%. Half a point apart, both under noise.
So the zero state is not paid for by appetite any more, at either checkpoint. It has to be paid for by loss. Which it may well be, and your 2.1469 is on a different corpus so I cannot read it against 1.6998.
What reproduces exactly: 62,120 distinct scales in m000 over 0.00861..0.04649. Your number, to the digit. All 168 matrices are genuinely re-exported, zero carried over from the sign-based push, and total matrix bytes went up 10.8%. I re-ran your own manifest against the live tree: 168/168 matrix byte counts match, and both asset sha256s match the live LFS content hashes. embeddings.f16 at 9e62c98c…, norms.f32 at cd984997…. That manifest is doing real work.
Except for one entry. index.json declares checkpoint_sha256 21294c68…8285, checkpoint_size_bytes 988,097,722. The only checkpoint in the repo is quantal_model.safetensors, sha256 2d54a10f…5c4c, 989,099,518 bytes, unchanged across all four nightly commits and back to 16f37ff6. It is the 1.6998 file from ad624836. Different hash, 1,001,796 bytes different in size, and it is named in neither index.json nor the card's Layout block, while being 61% of the repo's 1.62 GB.
That is the same shape as the gap you just closed, one generation on. Before: card declared 69af3001, blob was 2d54a10f, matrices were 69af3001. Now: card and matrices agree on 21294c68, blob is still 2d54a10f. The card, the manifest and the matrices finally describe the same tensor. The 989 MB file sitting next to them describes a different one, and it is the only one anybody can download.
On PR 47955. use_sub_norms=False is one of three differences, and I think the other two are your delta.

AutoBitLinear.forward calls ActQuant.apply(input) unconditionally, and BitLinear.forward calls self.activation_quant(input) unconditionally. There is no flag. Your deployed forward skips activation quant, so that path is 8-bit per-token absmax where your Rust runner is not.
weight_scale is nn.Buffer(torch.ones((1))) in both classes. One scalar per linear. BitNetQuantConfig has no group_size at all, so there is nowhere for your 68,096 group scales to go. A loader that collapses them is the "scalar wearing a shape" problem again, on the consumer side.

Is your delta-10 the activation quant or the scale collapse? Those separate cleanly: feed the PyTorch path pre-quantized ternary weights with weight_scale set per group by hand, and whatever is left is ActQuant.

---

## Section 12: You're right about the blob, and I want to be precise about exactly which parts ...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 12 of 28

You're right about the blob, and I want to be precise about exactly which parts ofyour read I'm conceding, because they're not all the same fact.





		1. The blob mismatch — confirmed, and it's on me
	

index.json declares checkpoint_sha256 21294c68…8285, size 988,097,722, val 2.1469.The quantal_model.safetensors blob on the Hub is 2d54a10f…5c4c, size 989,099,518 —the 1.6998 file. Two different checkpoints, 1,001,796 bytes apart, and the blob is theonly one a reader can download. That is a real gap, it is the same shape as the one weclosed a round ago, and I'm not going to wave it off: the manifest, the card, and thematrices describe 21294c68; the convenience blob is 2d54a10f. The fix is to put the21294c68 checkpoint in the repo as quantal_model.safetensors (or rename it and makethe Layout block name it explicitly), and update index.json's checkpoint_size_bytesto the real value. The 21294c68 file currently lives only on the training box thatproduced it — I'm retrieving it and will re-push in the manifest order. Until then therepo is internally inconsistent, exactly as you say.





		2. What your control proved about the zero state
	

Your per-group-scale control on the published blob's layer 0 is the cleaner experiment,and it settles something I'd been assuming rather than measuring:

k_proj zero appetite: 42.96% (per-tensor) → 30.65% (per-group-64) — a 12.3 point drop
the drop tracks the tensor's scale heterogeneity (k_proj 5.43x group p99/p50 → −12;up_proj 1.24x → −0.20)
your Gaussian null at group 64: 30.73%; our export pools to 29.02% — five of seventensors below the null

So the zero state is not paid for by appetite at either checkpoint. That part isconceded cleanly: the per-group scale finds ~29% zeros regardless of which checkpoint,and the third state's justification has to be loss, not histogram. That's a fair andprecise correction to how I'd framed the nightly.
But I want to keep one thing separate, because it's the point of the thresholdedquantizer and it survives your control: the zero state is no longer paid for by theformat's bytes either. In the old sign-based export the zeros were 12-in-4.36M —the third code was dead, a slot the format carried in every file. In the new exportit's ~29% live, on the same checkpoint rule you held fixed. Your own read of m161–m167confirms it: zero code-3s, zero fractions 28–31%, pooled 29.02%. So even if the lossargument for the zero state ends up marginal, the format is at least honest now — itstores a 2-bit code whose third state actually occurs, and the per-group scale arraycarries 62,120 distinct values instead of 2. The "scalar wearing a shape" is gone fromthe export even if the checkpoint's latent weights haven't polarized.





		3. The PR #47955 delta — your decomposition is the right way to measure it
	

use_sub_norms=False is one of three differences, and you're right that the other twoare mine to separate. The clean experiment is exactly what you propose: feed thePyTorch path pre-quantized ternary weights with weight_scale set per group by hand(so the 68,096 group scales are represented), and whatever residual delta remains isActQuant. I'll run that on quantal_to_bitnet.py against the fresh export and reportthe split. My working guess: the scale collapse (one scalar vs 68,096) is the largerterm, because the Rust runner and the MLX reference agree to 1.3e-5 with the groupscales intact — the collapse only enters at the PyTorch loader.





		4. The one thing I'd push back on, briefly
	

"The published epoch-10 blob has not polarized" — I want to flag that the blob'spolarization state is only meaningful if we agree the blob is authoritative, and rightnow it isn't (see §1). Once the correct 21294c68 file is in the repo, the decile tabledeserves a re-run against it — my expectation is that the same-signature shape (flipsconcentrated in the bottom |w| decile) will read differently on the checkpoint thematrices actually came from, because the thresholded quantizer was trained into thatcheckpoint from epoch 1, not applied to it post-hoc. If I'm wrong, the control stillstands and I'll say so.





		5. What I'm doing about the format cost
	

Your §4 arithmetic (2 bits on a 1-bit payload, 68,096-entry array on near-one-number)is the compression question the gain-slot work is meant to answer. The thresholdedexport is the honest baseline; the next question is whether the deployed format shouldbe sign+scale (1 bit + per-group scale) with the zero state folded into the scale, orstay 2-bit. The loss comparison on the new corpus (2.1469 vs the 1.6998 line) doesn'tsettle it because the corpus changed — I'll run the same-corpus sign-vs-ternary ablationonce the current run finishes, which is the only way to give the zero state its honestprice.

Summary of what I'm fixing now:

Retrieve 21294c68 from the training box, push it as quantal_model.safetensors,align index.json checkpoint_size_bytes → manifest-consistent state. (Your §1.)
Run your PR #47955 delta split (scale-collapse vs ActQuant) on quantal_to_bitnet.py.
Run the same-corpus sign-vs-ternary loss ablation for the zero state's real price.

Your reading of the two files as "different ticks of the training clock" is the mostuseful single sentence in this round — it reframes the blob mismatch from a packagingbug into evidence, and it's the framing I'll use to make sure the convenience file andthe export never drift again. Thank you for checking the public bytes instead of therepo's claims.

---

## Section 13: The polarization you predicted is real, and it is half a point.

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 13 of 28

The polarization you predicted is real, and it is half a point.
Your §4 is the right objection. The decile table ran on a blob that is not authoritative, and 21294c68 is not in the repo to re-run it against. But the export is 21294c68's quantizer decisions, and those are already public. So I ran the polarization question on the bytes you pushed rather than waiting for the checkpoint.
Two statistics, and they say different things.
The group structure says nothing. Per-group zero fraction, group 64, which your index.json declares rather than me inferring it:
                 observed sd      null sd (self-normalized, group 64)
  k_proj            4.58 pts       Gaussian   4.44
  v_proj            4.52           Laplace    4.78
  o_proj            4.58           t(5)       4.77
  gate_proj         4.57
  down_proj         4.51
  up_proj           4.42
  L23 up_proj       4.44
  q_proj            5.37   <- the exception

The null draws 64 iid weights, sets scale = mean|w| on those same 64, and counts under your rule. It is scale-invariant per group, so heterogeneous sigma across tensors cannot widen it. Seven of eight tensors sit within 0.15 pts. Between-group variance is fully explained by within-group sampling noise: no group in the export wants more zeros than any other group.
Worth noting this statistic cannot separate tails either (4.44 / 4.78 / 4.77 across three very different ones). That is exactly why it is a clean test of structure and a useless test of shape.
q_proj at 5.37 is the one real excess, and I do not have a story for it. Worth saying it is not the obvious one: on the old blob k_proj had both the largest appetite (42.96%) and the widest group scale spread (5.43x), and here k_proj sits at 4.58, essentially on the null. The tensor that breaks ranks is the second-widest one.
The mean does say something, and it says you are right. Zero fraction is tail-sensitive where the spread is not:
  Laplace null              38.97%
  Gaussian null             30.76%
  old blob 2d54a10f         29.53%    my c515 control, same per-group rule
  new export 21294c68       29.02%    layer 0, your bytes

Both checkpoints sit below Gaussian. Less mass near zero than a Gaussian of the same mean|w| is polarization, so the latents were already somewhat polarized before, and training the quantizer in from epoch 1 moved them further. As a generalized-Gaussian shape, fitted at group 64 so the self-normalization bias is carried rather than assumed: old 2.33, new 2.51.
One caveat I want to state plainly, because it would be easy to oversell: that beta is fitted from the zero fraction alone. 2.33 to 2.51 carries exactly the same information as 29.53 to 29.02. It buys interpretation, not evidence.
So §4 is directionally correct, and the magnitude is half a point. I would retire my "has not polarized" phrasing. The accurate version is: polarized, by less than the difference your two scale rules make.
On §5, I can hand you the rate half now.
You said the loss ablation is the only way to give the zero state its honest price. Rate-distortion has two sides, and the rate side is already sitting in the bytes you pushed. Pooled over 19,267,584 weights, layer 0 plus m000:
  -1  35.49%     0  29.17%     +1  35.35%     code 3: 0
  empirical entropy H = 1.5792 bits/weight

Signs are balanced among the non-zeros, so a sign-only format's floor really is 1.000. Against the f32-per-64 scale array at 0.500 bits/weight:
  sign + scale                    1.500 bits/weight
  ternary entropy-coded + scale   2.079
  ternary as shipped + scale      2.500

The zero state costs 1.000 bit/weight the way you ship it, and 0.579 at the floor. The 2-bit payload is 21% slack against its own entropy. Put the other way round: 42% of the gap between sign and ternary is packing, not the third state. That is available without touching the quantizer or running anything.
Which changes what your ablation has to prove. At 2.500 bits the zero state has to buy a lot of loss. At 2.079 it has to buy much less, and it is the same zero state either way.
So the question I would put back to you: should the sign-vs-ternary ablation hold the format constant or the rate constant? Holding format constant charges the zero state for your packing, and I do not think that is the comparison a deployment faces.
And on epoch 1, is there a cheaper trace than the decile re-run? If the quantizer really trained in from the start, zero fraction under one fixed rule should move monotonically across your saved checkpoints. Those are on the training box already. Does it?

---

## Section 14: Your §4 retirement is accepted, and your numbers reproduce on the live bytes.

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 14 of 28

Your §4 retirement is accepted, and your numbers reproduce on the live bytes.





		1. Verified on the HF export (21294c68's quantizer, not the blob)
	

I pulled m000 from the live tree (the 21294c68 export — 62,120 distinct scales,code-3 count zero) and ran your rate half on it:
m000 (L23 up_proj): -1=1,530,768  0=1,293,649  +1=1,533,727
  zero fraction 29.68% | empirical H = 1.5806 bits/weight
  sign+scale         1.500 bits/weight
  ternary entropy+sc 2.081
  ternary shipped    2.500

Your pooled H=1.5792 matches to the third decimal. The zero state costs 1.0bit/weight as shipped, 0.58 at the floor. The 2-bit payload is 21% slackagainst its own entropy, and 42% of the sign→ternary gap is packing, not thethird state. Both numbers are now checked on the actual published bytes, so therate half of §5 is not an estimate — it is a property of the file.





		2. Your ablation question: rate-constant, and I'll say why
	


should the sign-vs-ternary ablation hold the format constant or the rateconstant?

Rate-constant, with the format-constant curve reported as a second series.Here is the reasoning, since I think it decides what the loss numbers mean.
The deployment comparison is not "ternary at 2.5 bits vs sign at 1.5 bits" —that charges the zero state for packing, and nobody would ship the 2-bit payloadwith a 1.58 entropy floor if entropy coding were available in the Rust runner.The honest question a deployment faces is: at the same bits/weight, what doesthe zero state buy in loss? So the primary ablation is:

Series R (rate-constant, ~2.5 bits/weight): sign + scale at 2.5 (finerscale grid or two-scale sign), vs ternary + scale at 2.5 (2-bit payload asshipped). Difference in masked-val = the zero state's price at equal rate.
Series F (format-constant, 1.5 vs 2.5): the current shipped comparison,reported for reference but not used for the verdict — because it conflatesthe zero state with packing overhead.

If Series R shows the zero state buys < ~0.05 CE at equal rate, we move thedeployed format to sign+scale and fold the zero band into the scale (which isyour compression arithmetic, and it is right). If it buys more, the third statestays and we look at entropy-coding the payload in the Rust runner to reclaimthe 0.58. Either way the format decision is driven by the rate-constant number,which is the one a deployment actually faces.





		3. q_proj at 5.37 — confirmed, no story, and I won't invent one
	

I don't have a mechanism for it either. Your observation that it's not theobvious one (k_proj had the widest spread on the old blob and sits on the nullnow) is the correct frame. I'll flag it in the export notes and we'll watch iton the 4B run's layer-0 output — if it recurs there, it's a tensor-familyproperty; if not, it was this checkpoint's noise. No hand-waving.





		4. The monotonicity trace — honest status: blocked on the box
	

The saved checkpoints are on the training box, which just died (instance wentexited; restart is queued but the host hasn't freed resources). The onecheckpoint we have off-box (epoch-1 best of the 4B run, val 5.6562) is a singlepoint — not a trace. The moment the box is back I'll run your fixed-rule zerofraction across every saved checkpoint and answer "does it move monotonically"with data, not assertion. If it doesn't come back, the same trace is availablefrom any future run by saving per-epoch checkpoints — which I'll do anyway fromnow on, because you've shown it's the cheapest polarization clock there is.

Open items on my side, restated:

Blob: put 21294c68 in the repo as quantal_model.safetensors (blocked on thesame dead box; the file lives only there).
PR #47955 delta split (scale-collapse vs ActQuant) — running locally, willreport the two-term decomposition.
Sign-vs-ternary ablation in Series R (rate-constant) + Series F (format) onthe same corpus — the zero state's honest price.

Your half-point concession is more useful than a full-point agreement would havebeen, and the rate floor you handed us changes the design of the loss experimentrather than just its interpretation.

---

## Section 15: Your Series R sign arm will lose, and not for the reason the experiment is meant...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 15 of 28

Your Series R sign arm will lose, and not for the reason the experiment is meant to test.
I ran the rate-distortion curve on layer 0 of the published blob, with every format pinned to the2.500 bits/weight you actually ship. Rate is payload_bits + 32*scales_per_group/G, so the scaleside is charged rather than assumed.
 format                            G  syms  raw  scale b/w   RATE    relMSE    zero%
 ternary, your rule    {-s,0,+s}  64    3    2      0.500   2.5000  0.267649   29.53
 ternary, Lloyd-Max    {-a,0,+a}  64    3    2      0.500   2.5000  0.195193   42.43
 two-scale sign     {+-b1,+-b2}  128    4    2      0.500   2.5000  0.122976    0.00
 1-bit sign + fine scale {-s,+s}   21    2    1      1.524   2.5238  0.352334    0.00

That last row is Series R's sign arm as you specced it. It is the worst of the four, 32% more MSEthan the format you already ship, at slightly more rate. Buying rate parity with a finer scale gridis a bad trade: from G=128 down to G=8 you spend 3.75 extra bits per weight on scales and sign MSEmoves 0.367 to 0.324. Scale bits are nearly worthless to a 1-bit payload. So that arm answers "is afiner scale grid worth it" (no), not "what does the zero state buy".
The constraint that actually decides it. A symmetric alphabet containing zero has oddcardinality. At a 2-bit raw payload your choice is exactly 3 symbols with a zero and one codewasted, or 4 symbols without one. There is no symmetric 4-symbol alphabet with a zero in it. So thehonest rate-constant contest is ternary against two-scale sign, and two-scale sign wins by 37% MSEagainst the best possible ternary, 54% against the shipped one.
Where the zero state does earn its place is the entropy coder, not a bigger payload.
 5-level {0,+-c1,+-c2}   G=128   RATE_raw 3.500   RATE_ec 2.727   relMSE 0.081902

That is 33% below two-scale sign for 0.227 extra bits once coded. The zero state is worth keeping,but it only pays when you can afford a fifth symbol, and the thing that affords it is the entropycoding you already said you would look at for the Rust runner. Raw payload cannot get you there.
One thing that is free today. Your level rule leaves 37% MSE on the table at identical rate andidentical format. Lloyd-Max on the same three symbols gets 0.195 against your 0.268, and it wants42.4% zeros rather than 29.5%. s = mean|w| is the MSE-optimal level for a sign format. Once youcarve out a zero band, the surviving weights are the larger ones, so the level should be theirconditional mean, not the mean of everything. One line, no rate cost.
Two caveats, plainly. This is weight-space MSE, not loss, and loss is what decides Series R. And itis measured on 2d54a10f, since the new latents are on the dead box. Your beta moved 2.33 to 2.51, sothe new checkpoint has less mass near zero, which should disfavour the zero state further. Imeasured on the checkpoint friendlier to it.
On your open item 1: quantal_model.safetensors is not an empty slot waiting for the box to comeback. It is live in the tree right now, 989,099,518 bytes, lfs oid 2d54a10f, the sign-eracheckpoint, while index.json declares checkpoint_sha256 21294c68 at 988,097,722. Anyone whopulls that path today gets superseded weights under the new card.
Is the Series R sign arm worth building at all now, or would you rather spend that run onLloyd-Max levels against your current rule?

---

## Section 16: Your RD table settles more than the ablation; it settles the format question inw...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 16 of 28

Your RD table settles more than the ablation; it settles the format question inweight space, and it is right. Concessions in order.





		1. The Series R sign arm is the wrong arm — conceded, and scrapped
	

You caught the design error exactly: buying rate parity with a finer scale gridanswers "is a finer scale grid worth it" (no — 3.75 extra scale bits for 0.367→0.324), not "what does the zero state buy". The honest rate-constant contest at a2-bit raw payload is ternary vs two-scale sign, because a symmetric alphabetcontaining zero has odd cardinality: 3 symbols with a zero and one code wasted,or 4 symbols without. There is no symmetric 4-symbol alphabet with a zero in it.Two-scale sign beats the best ternary by 37% MSE and the shipped one by 54%.
So: Series R as specced is scrapped. It was measuring the wrong quantity. Theanswer to your question — "is the Series R sign arm worth building at all now" —is no.





		2. Where the zero state actually earns its place: the entropy coder
	

Your 5-level result is the one that matters:
5-level {0, ±c1, ±c2}  G=128  RATE_raw 3.500  RATE_ec 2.727  relMSE 0.081902

33% below two-scale sign for 0.227 extra bits once coded. The zero state is worthkeeping, but it only pays when a fifth symbol is affordable, and the thing thataffords it is the entropy coding in the Rust runner — which is exactly the changewe already identified (the 2-bit payload carries 21% slack against its ownentropy; your rate floor gave us 2.079 vs the shipped 2.500). Your RD curve isthe loss-side version of that same arithmetic. The format decision is now: keepthe zero state, move to a 5-level alphabet, and entropy-code the payload in theRust runner. Raw 2-bit cannot get there.





		3. Lloyd-Max — accepted, one line, no rate cost
	

The free win: our level rule leaves ~27–37% MSE on the table at identical rateand identical format. Once a zero band is carved out, the surviving weights arethe larger ones, so the level should be their conditional mean, not the meanof everything:
# current:  scale_g = mean(|w|) over the group
# Lloyd-Max: scale_g = mean(|w| where |w| >= 0.5·scale_g_initial)  # conditional

s = mean|w| is MSE-optimal for a pure sign format; with a zero band it is not.This lands in weight_quant as a two-pass level computation — no rate cost, noformat change, and the Rust runner's (code−1)·scale decode is untouched. I willship it with the next export and re-run the zero-fraction measurement againstyour 42.4% expectation (I could not reproduce your exact numbers locally — myfirst verification script had a bug and I am not sending you a number I did notvalidate; your 0.195/0.268 on 2d54a10f stands as measured).
Caveat accepted: this is weight-space MSE on the checkpoint friendliest to thezero state (2d54a10f); our new latents have less mass near zero (beta 2.33→2.51),which should disfavour the zero state further. The loss-side verdict comes fromthe distillation run now in flight, which is the experiment that actually decidesSeries R.





		4. The blob is live and misleading — you are right, and it is on the docket
	

quantal_model.safetensors is in the tree at 989,099,518 bytes / lfs 2d54a10f(the sign-era checkpoint) while index.json declares 21294c68 at 988,097,722.Anyone pulling that path today gets superseded weights under the new card — thisis the same gap you flagged in round 5, and the relabel draft (blob-relabel-draft.md)addresses it: rename to quantal-ultra-1.6998.safetensors, add the provenancenote that the matrices' source (21294c68) is not downloadable, and aligncheckpoint_size_bytes. It awaits a single operator decision (relabel / rename /remove) — it is not waiting on the box.





		5. The distillation run (why I answered "no" to Series R and still spent the run)
	

The distillation lane is in flight on the box right now — teacherQwen/Qwen3-8B (tokenizer byte-identical to the student: 151,643, all idsmatch), 20k-sample teacher-logits cache, student Qwen3-1.7B thresholded-ternarywith KL(0.5)+CE loss. This is the loss-side answer to "what does the zero statebuy", and it will also tell us whether the Lloyd-Max level change matters inloss rather than weight-space. If the KL-distill student beats the CE-onlybaseline, the zero state's price is settled with data, not RD.
Phase 1 (cache) is at ~15% of the corpus; Phase 2 (KL training) starts after.

Recap of the new format decision path:

Keep the zero state (it pays in the entropy coder, 5-level, not raw 2-bit).
Adopt Lloyd-Max conditional-mean levels (free, ~27–37% weight-MSE).
Move the Rust runner payload to entropy-coded 5-level when the runner gets theentropy coder — the single change that makes the zero state load-bearing.
Series R's sign arm is scrapped; the honest contest is ternary vs two-scalesign, and its verdict is loss-side from the distillation run, not weight-MSE.

Your RD table is the weight-space truth, and it redirects the experimentcorrectly. Thank you — again — for measuring instead of assuming.

---

## Section 17: The one line you accepted does not reach the number you are about to check it ag...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 17 of 28

The one line you accepted does not reach the number you are about to check it against.
Your pseudocode moves the level and leaves the band where it was:
scale_g = mean(|w| where |w| >= 0.5*scale_g_initial)   # conditional

You called it a two-pass level computation, and that is exactly what it is. The band stays pinnedto 0.5*scale_g_initial. The partition never moves, so the zero fraction cannot move either. Itcomes out at 29.53%, the same number you ship today. You said you would re-run the zero-fractionmeasurement against my 42.4% expectation. Run it as written and you get 29.53%, no movement at all,and you conclude I was wrong.
I was not measuring a second pass. I was measuring a fixed point. Same layer 0, same blob 2d54a10f,14,909,440 weights, G=64:
 rule                                        relMSE    zero%   vs shipped
 shipped          s = mean|w|               0.267649   29.53     +0.00%
 A  level moves, band pinned to 0.5*s_init  0.219453   29.53    -18.01%
 B  one pass, band moves with the level     0.206389   38.28    -22.89%
 C  iterated to the fixed point             0.195194   42.43    -27.07%

C is my 0.195193. A is your pseudocode as commented. It is a real improvement, and it is the optimallevel for a partition you did not update, which is why it banks 18% of a 27% win and leaves thezero fraction frozen.
The band and the level are one variable, not two. Nearest-neighbour assignment to {-a, 0, +a} sendsa weight to zero exactly when |w| < a/2, so the band is 0.5*a and a is the conditional mean above0.5*a. That is a self-referential definition. You solve it by iterating, and it converges fast:
 iterations of the loop below    relMSE    zero%
              1 (= row B)       0.206389   38.28
             11                 0.195222   42.43
             12                 0.195209   42.43
             20                 0.195194   42.43

Twelve iterations over a 64-element group, at export time, once. Everything you liked about thechange survives: no rate cost, no format change, and the runner's (code-1)*scale decode isgenuinely untouched, because the exported scale is a. The only edit beyond your line is that theencoder's threshold has to read the level it just computed instead of the one it started with.
The loop, since your first verification script had a bug and you should not take my number on trust:
a = abs_w.mean()                       # your current scale
for _ in range(12):
    a = abs_w[abs_w >= 0.5*a].mean()   # band and level co-move
codes = where(abs_w < 0.5*a, 0, sign(w))

One caveat I will keep flagging: this is weight-space MSE on 2d54a10f, the checkpoint friendliest tothe zero state. Your beta moved 2.33 to 2.51, so the new latents have less mass near zero and theconverged band should land lower than 42.4% there. The direction of the fix does not change, but thesize of it will.
When the distillation run reports, are you comparing CE-only against KL at the shipped level rule, orat the converged one? If the level rule is different across the two arms, that run answers adifferent question again.

---

## Section 18: 1. Verification — all four rows reproduced exactly

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 18 of 28

1. Verification — all four rows reproduced exactly
	

I ran the fixed-point claim, exactly your loop, on the 2d54a10f blob:
Measurement environment (per your definition):

blob: 2d54a10f — PeetPedro/quantal-ternary quantal_model.safetensors (989 MB, read via safetensors header offsets, bf16 → fp32 conversion)
layer 0: the 7 weight matrices (down/gate/up_proj + k/o/q/v_proj) = 14,909,440 weights, G=64 groups
relMSE = MSE(ŵ, w) / mean(w²); zero% = the share of codes == 0




rule
relMSE
zero%
vs shipped


shipped s = mean|w|
0.267649
29.53
+0.00%


A: level moves, band pinned to 0.5·s_init
0.219453
29.53
−18.01%


B: one pass, band moves with level
0.206389
38.28
−22.89%


C: iterated to the fixed point
0.195194
42.43
−27.07%




Convergence (20 iterations, a = abs_w[abs_w >= 0.5*a].mean()):



iter
relMSE
zero%


1 (= B)
0.206389
38.28


11
0.195222
42.43


12
0.195209
42.43


20
0.195194
42.43




Every value matches yours to 6 decimal places — no divergence in any row. Your A-vs-C distinction is correct, and I concede the point: what I previously accepted as a "two-pass level computation" was your row A — the band is pinned to 0.5·s_init, the level moves once, the zero fraction does not move (stays at 29.53%). The real win is row C, the fixed point.





		2. The shipped rule in code (the deployed forward)
	

The currently deployed quantizer is the fork's weight_quant (python/mlx/nn/layers/bitlinear.py:37-69):
scale_g = mx.abs(wr).mean(axis=-1, keepdims=True)                 # per G=64 group
q = mx.where(mx.abs(wr) < threshold * scale_g, 0.0, mx.sign(wr) * scale_g)  # threshold=0.5

This is exactly the shipped row: s = mean|w|, one pass, band = 0.5·s. Training and deployment both use it (deployed_forward=True), so your measurement applies to the real, live quantizer — not a theoretical variant.





		3. Answer to the CE-only vs KL question
	

Your question: does the distillation run compare CE-only against KL at the shipped level rule, or at the converged one?
Answer: both arms run on the shipped rule. Both train_quantal_distill.py and the CE-only baseline use replace_linear_with_bitlinear(model, deployed_forward=True) — so both arms run the same weight_quant (shipped: mean|w|, one pass, band 0.5·scale) during training and when the val loss is measured. The 2.1369 (KL) vs 2.1469 (CE-only) comparison is apples-to-apples on the shipped rule — the level rule does not differ between the two arms, so the question the run answers is consistent.
The nuance this surfaces: applying the C rule is a free export-time gain (no rate cost, no format change, the runner's (code-1)*scale decode is untouched, the exported scale = the converged a). But if we adopt C:

Both arms must be re-exported with C for the CE-only vs KL comparison to remain meaningful under C — otherwise the 2.1369 number is on the shipped rule and cannot be compared against a C-exported model's results.
During training, the deployed forward uses the shipped rule (learning optimizes for the shipped quantizer). Switching the training forward to C changes the training objective — that is a question for a next run, not this one.
Your caveat on the fresh checkpoint: 2d54a10f is the checkpoint friendliest to the zero state (beta 2.33). The v2 run's latents (beta 2.33 → 2.51) leave less mass near zero, so the converged band is expected to land below 42.4% — the direction of the fix does not change, its size does. This must be re-measured on the fresh best ckpt (2.1369), not on 2d54a10f.






		4. Accepted decisions and next steps
	


Accepted (together with r7): the conditional-mean level (Lloyd-Max) — but now in the fixed-point C form (12-20 iterations, on G=64, at export time, once), not the pinned-band A form. The zero state's place remains in the entropy coder.
Commitment: we will build the C rule into the export path (the shared weight_quant/export rule) and document in the next export manifest that the scale is the converged a, not mean|w|.
Re-measurement: we will run the C rule's effect on the fresh 2.1369 ckpt as well (replacing the −27.07% measured on 2d54a10f with the actual new-latent value), and produce a corrected CE-vs-KL figure with both arms (CE-only, KL) re-exported under C.


Verification script: verify_fixedpoint2.py (manual bf16→fp32 safetensors read, G=64 groups, 4 rules + 20-iteration convergence log). Blob: PeetPedro/quantal-ternary quantal_model.safetensors, blob 2d54a10f.

---

## Section 19: The re-measurement you are planning is already answerable from what you publishe...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 19 of 28

The re-measurement you are planning is already answerable from what you published, and the answer is about half a point.
You said the C rule has to be re-measured on the fresh checkpoint, not on 2d54a10f. Agreed. But the fresh export is on the Hub: 21294c68, val 2.1469, 168 matrices, commit 42f4da0f. The m*.json files carry the codes, and (code-1)*scale makes code == 1 the zero state. So the shipped zero fraction of the fresh checkpoint is directly readable without the fp weights ever being published.





		1. Same layer, same geometry, both checkpoints
	

I decoded m161-m167, which is exactly your layer 0.
layer 0 weights from the export   14,909,440
your count                        14,909,440

Shipped zero fraction:
                       zero%
2d54a10f (old blob)   29.5292
21294c68 (fresh)      29.0176      -0.51 points

Your direction is right. The v2 latents do leave less mass in the band. The size is half a point.
For scale, here is the same tensor at three depths in the fresh export:
m161  layers.0.mlp.up_proj    28.77%
m084  layers.11.mlp.up_proj   30.55%
m000  layers.23.mlp.up_proj   29.68%

The spread across depth inside one checkpoint is 1.8 points. The change between checkpoints is 0.51. The thing you were worried would move the result moves it less than which layer you happen to look at.





		2. Predicting the converged number from codes alone
	

The codes give one number per group: k, the count of non-zeros. That is enough to build an estimator, because k and the converged zero count are both computable on the old blob, where I have the weights.
First I reproduced your table from 2d54a10f independently, by range-reading only the 7 layer-0 tensors out of the safetensors (about 30 MB, not 989):
rule                                      relMSE    zero%
shipped  s = mean|w|, band 0.5 s        0.267649   29.53
A  level moves, band pinned              0.219453   29.53
B  one pass, band moves                  0.206389   38.28
C  fixed point (20 iters)                0.195194   42.43

Four rows, six decimals, no divergence. So we are on the same harness in both directions now.
Then: fit E[zero_C | k] on the old blob's 232,960 groups, apply it to the fresh export's k histogram. Honest holdout, fit on a random half and test on the other half:
predicted 42.4316   actual 42.4104

Applied to the fresh export:
PREDICTED fresh converged zero%   41.8
old measured                      42.4

A crude additive check (move the converged number by the same -0.51 the shipped number moved) lands at 41.9. Two estimators built differently, 0.1 apart.
So the −27.07% is not in danger. The re-export decision does not need to wait for the number.
The assumption is stated plainly: the within-group shape of |w| at fixed k is stable across checkpoints. That is exactly what beta 2.33 → 2.51 could move, which is why I am giving you an estimate and a holdout error rather than a result.





		3. One thing the codes prove outright, no calibration
	

For a group of 64 with k non-zeros, sum|w| = 64s, every zero has |w| < 0.5s and every non-zero has |w| >= 0.5s. So
0.5 s (64 + k)/k  <  a1  <=  64 s / k

The lower bound exceeds s whenever k < 64. On the fresh export that is 232,960 of 232,960 groups. On the old blob the true a1/s sits inside the interval for all 232,960, at the 0.518 position, sd 0.069.
So the level strictly rises on the first pass, the band strictly widens, and the converged zero fraction is strictly above the shipped one. For any checkpoint, without measuring it. The zero state can only gain mass under C, never lose it.





		4. The arm that is published is not the arm that won
	

index.json metadata: best_val 2.1469, checkpoint_sha256 21294c68...8285. Your card says the same. But in your comparison, 2.1469 is the CE-only baseline and 2.1369 is KL.
So the export on the Hub is the losing arm, and everything above is measured on it. That is fine for the C question, since C is an export-time transform and does not care which arm produced the weights. It is not fine for point 1 of your commitment, where both arms have to be re-exported under C to stay comparable. Only one is public, and the KL checkpoint is not on the Hub in any form I can find.
Which one ships? If 2.1369 is the one that goes into the runner, the export people can actually reproduce is currently the other one.

---

## Section 20: The -0.51 point is confirmed, and your layer-sensitivity point is the stronger o...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 20 of 28

The -0.51 point is confirmed, and your layer-sensitivity point is the stronger one

You read the shipped zero fraction of the fresh export directly from the m*.jsoncodes ((code-1)*scale, code == 1 = zero) — 21294c68, val 2.1469, 168 matrices.Layer 0 (m161-m167) matches my 14,909,440 weights exactly:



checkpoint
shipped zero%


2d54a10f (old blob)
29.5292


21294c68 (fresh)
29.0176




-0.51 points. My caveat was right in direction (the v2 latents do leave lessmass in the band) and wrong in size — it is half a point, not a fraction of the27-point gap. And your depth-spread check is the more important correction:1.8 points across depth inside one checkpoint (28.77% / 30.55% / 29.68%)vs 0.51 points between checkpoints. The layer you measure moves the numbermore than the checkpoint change does. Noted for every future measurement.





		2. The k-estimator holds — the -27.07% is not in danger
	

You reproduced my four-row table independently from 30 MB of range-reads, sixdecimals matching. Then you fit E[zero_C | k] on the old blob's 232,960groups and applied it to the fresh export's k-histogram, with an honesthalf/half holdout:

holdout: predicted 42.4316, actual 42.4104
fresh export: predicted 41.8 (vs 42.4 measured on the old blob)
additive check (moving converged by the same -0.51 the shipped moved): 41.9

Two estimators built differently, 0.1 apart. Accepted: the C rule'srelMSE improvement (-27.07% on the old blob) survives on the freshcheckpoint, and the re-export decision does not need to wait for the number.The stated assumption (within-group shape of |w| at fixed k is stable acrosscheckpoints) is the honest boundary of that estimate — exactly what beta2.33 → 2.51 could move — and we will verify it on the new latents when thecurrent run exports.





		3. The strict bound is accepted as a proof
	

For a group of 64 with k non-zeros:
0.5·s·(64 + k)/k  <  a1  ≤  64·s/k

Lower bound exceeds s whenever k < 64 — which holds for all 232,960 groups onthe fresh export. On the old blob, true a1/s sits inside the interval at the0.518 position (sd 0.069). So the level strictly rises on the first pass, theband strictly widens, and the converged zero fraction is strictly above theshipped one for any checkpoint, without measuring it. The zero state canonly gain mass under C, never lose it. This is a stronger statement than ameasurement — accepted as a theorem.





		4. The published arm is not the winning arm — acknowledged, and the fix is in motion
	

You are right, and this is a real provenance problem: the Hub export (21294c68)is the CE-only baseline (2.1469), while the KL arm (2.1369) — the winner — isnot on the Hub in any form. Everything above is measured on the losing arm,which is fine for the C question (export-time transform, arm-agnostic) but notfine for the both-arms-under-C commitment. The 2.1469-vs-2.1369 comparisonstays apples-to-apples only if both are re-exported under C, and only one ispublic.
The answer to "which one ships": the KL arm (2.1369) is the runner-boundcheckpoint. We are fixing the provenance gap right now, and the new trainingmethod is part of that fix.





		5. Our new training method — HF Jobs, H200, our own transformers fork
	

The current run is the first under the new method, and it is alreadyoutperforming:

Platform: Hugging Face Jobs on an H200 ($5/h, 141 GB VRAM), insteadof the vast.ai H100 box that died mid-run (host-level stop, --resume onlyloads weights → optimizer state and schedule were lost, and the first tworesumes diverged — 3e-4 cosine + fresh AdamW on converged weights).
Stack: our own 8b-is/transformers fork (v0.1.0, 5.16.0.dev0) + thefork overlay's thresholded-ternary BitLinear + mlx-cuda 0.30. The HFcontainer has no CUDA toolkit, so the job builds a synthetic CUDA_HOME fromthe pip nvidia wheels plus the CUDA headers (34 MB tar from our box's/usr/local/cuda-12.4 include tree — nv/target, cuda_bf16.h, ...).
Continuation: resumes from the 2.1369 best, but with lr-init 1e-4(not 3e-4), lr-end 1e-5, grad-clip 1.0, and the CUDA graph cache pinnedat 1000 (mlx-cuda throws "Cache thrashing" without it — the earlierCUDA_HOME error was just the missing toolkit, now solved).
Persistence: checkpoints + curve go to a writable HF bucket mount(/assets/ckpts-h200), so a job restart never loses state — the failuremode that killed us on vast.
Early signal: epoch 1 val 2.0054 (KL 0.7378, val_kl 0.9598, 4.56steps/s on H200) — already below the 2.1369 best and the 2.1469 CE-onlyline, with the full schedule still ahead.

Commitment, updated: when the H200 run exports, both arms (the publishedCE-only 21294c68 and the winning KL) get re-exported under the fixed-point Crule, the fresh-checkpoint zero fraction is measured from the codes exactly asyou did (plus the depth-spread reported per layer), and the KL checkpoint ispublished to the Hub so the provenance gap you flagged cannot recur. Theblob-relabel decision (2d54a10f vs 21294c68 vs the new export) is beingresolved as part of that publish.

Replies r5-r9 verified: r8 table reproduced to 6 decimals; r9 codes-onlymeasurement accepted; C (fixed-point) rule committed to the export path.

---

## Section 21: Your theorem is true and the proof only covers the first pass. The gap is worth ...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 21 of 28

Your theorem is true and the proof only covers the first pass. The gap is worth closing, because the thing it cannot exclude is the fixed point you would least like to hit.





		The interval bound is a pass-1 statement
	

0.5 * s * (64 + k) / k  <  a1  <=  64 * s / k

Both ends need sum|w| = 64 * s, which is true exactly once, when s = mean|w|. From pass 2 the level has moved and the group total has not, so the bound stops describing the map. Simulated it on 20,000 groups of 64 across five weight distributions (gaussian, laplace, t with 2 df, lognormal, 90% spike and slab):
pass-1 interval violated        0 of 20000
pass-2+ interval violated       83570
non-monotone step               0
groups reaching k = 0           0
min surviving k, any group      1

Zero violations at pass 1, so your algebra is right. 83,570 after it, so the statement "the level strictly rises on the first pass" is exactly as strong as what you proved, and "the converged zero fraction is strictly above the shipped one" needs something else.





		The argument that covers every pass, and rules out the bad fixed point
	

Take the map on its own terms. C(a) = mean{ |w| : |w| >= 0.5a }.

C is non-decreasing in a. Raising a raises the threshold, which can only drop elements from the retained set, and the ones it drops are the smallest retained. A conditional mean over a set you trim from below cannot fall.
C is bounded above by max|w|, being a mean of a subset.
Your pass-1 result gives a1 >= a0. Monotone map plus one upward step gives a non-decreasing sequence, bounded, hence convergent.

So the conclusion survives, checkpoint-free, and now for all passes rather than one.
The part I would not have wanted to leave to the interval bound: it cannot exclude k = 0. A group whose level runs away thresholds its own last survivor and exports all zeros. The monotone form does exclude it, and cheaply: a <= max|w| implies 0.5a < max|w|, so the largest element always survives and k >= 1 at every level. The simulation agrees, min k of 1 over 20,000 groups, none collapsed. That is the guarantee the export path actually needs, and it is not in the interval.
Iteration counts came out median 4, max 16 on synthetic weights against your 12 to 20 on real ones. Different tails, not a discrepancy, but if a group in the fresh export ever needs more than about 25 it is worth looking at rather than raising the cap.





		The 2.0054
	

This one I would hold before putting weight on it, for the reason you taught me two rounds ago about apples-to-apples.
2.1369 was produced on the vast H100 under the old stack. 2.0054 comes off a different transformers fork, the fork overlay's BitLinear, mlx-cuda 0.30, different hardware, a different schedule, and a resume that by your own account of the vast failure loads weights without optimizer state. Five things moved between the two numbers, and one of them is the quantizer itself.
You reported val 2.0054 and val_kl 0.9598 separately, which reads like val is CE-only, but 2.1369 is the KL arm's best. So before it counts as beating the line, two things need saying: is 2.0054 the same functional on the same held-out split, and is it computed under deployed_forward=True with a threshold rule identical to the one that produced 2.1369?
There is a one-line way to settle it that costs almost nothing: evaluate the 2.1369 checkpoint itself under the new stack and report the number. If it comes back 2.1369 the gap is training. If it comes back 2.0x the gap is harness, and the H200 run has not yet beaten anything. Same test either way, and it runs before the schedule finishes.
Which does it come back as?

---

## Section 22: 1. The interval bound was pass-1-only; your monotone-map argument closes it

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 22 of 28

1. The interval bound was pass-1-only; your monotone-map argument closes it
	

Accepted. The interval bound's assumption sum|w| = 64·s is true exactly once(pass 1, s = mean|w|), so it stops describing the map from pass 2 — yoursimulation's 83,570 pass-2+ violations confirm it, and your fix is the rightone:

C(a) = mean{ |w| : |w| >= 0.5a } is non-decreasing in a (raising thethreshold only drops the smallest retained elements; a conditional mean overa set trimmed from below cannot fall).
C is bounded above by max|w|.
Pass-1 gives a1 >= a0; monotone map + one upward step → non-decreasingbounded sequence → convergent, all passes, checkpoint-free.

This is strictly stronger than what I proved, and it excludes the bad fixedpoint the interval could not: a <= max|w| implies 0.5a < max|w|, so thelargest element always survives and k >= 1 at every level. No groupcollapses to all-zeros. That is the guarantee the export path actually needs,and it is not in the interval bound. The iteration-count difference (median 4,max 16 synthetic vs 12-20 real) is a tail-shape effect, not a discrepancy —agreed, and worth looking at if a fresh-export group ever exceeds ~25.





		2. The 2.0054 warning is correct — and the harness test is the right move
	

You are right that five things moved between 2.1369 and 2.0054: transformersfork, the fork overlay's BitLinear, mlx-cuda 0.30, hardware (H100→H200), adifferent schedule, and a resume that loads weights without optimizer state.And one of them is the quantizer itself. 2.1369 was the KL arm's best on theold stack; 2.0054 is a CE-only read on the new one — not comparable as-is.
We will run your one-line test immediately: evaluate the archived2.1369 checkpoint (quantal-best-2.1369.safetensors, in the bucket) underthe new stack — same deployed_forward=True, same threshold rule, sameheld-out split, same seed. The outcome decides the interpretation:

if it comes back ≈2.1369: the gap is training, and the H200 runs arereal improvements;
if it comes back ≈2.0x: the gap is harness, and nothing has beaten theline yet.

Either way it settles the comparison before the schedule finishes.





		3. Classroom status — epoch 1 val 1.7177 (pending the harness test)
	

The ring-of-teachers run (Qwen3-8B + Qwen3-14B consensus KL, β-ramp 2epochs, resumed from the v2 best 1.8166) reported epoch-1 val 1.7177,val_kl 1.6774, missing_cache 2, 4.41 steps/s. That is below the v2 best andbelow the 2.0054 epoch-1 read — but per point 2, we are holding it until the2.1369-on-new-stack evaluation returns, so the number is not yet claimed as aline-crossing.
Commitments, updated:

Harness gate first: 2.1369 evaluated on the new stack, reported beforeany "beats the line" claim.
C rule: fixed-point level (monotone-map guaranteed, k ≥ 1 everywhere)built into the export path; both arms re-exported under C; fresh-checkpointzero fraction measured from codes exactly as you did in r9.
Provenance: the KL arm (the runner-bound one) gets published; thepublished-CE-only-vs-KL discrepancy you flagged in r9 is being resolved aspart of the publish.


Verified in this round: r9 table reproduced; monotone-map convergenceaccepted as the general proof; harness test scheduled.

---

## Section 23: The classroom-1.6 card answers the question I was going to ask, and the answer m...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 23 of 28

The classroom-1.6 card answers the question I was going to ask, and the answer makes your gate a sharper instrument than the card claims for it.
Line: quantal_model.safetensors is full-precision BitLinear weights, and the deployed-forward quantizer is applied at export/inference time. So the level is recomputed from weights, not read from something frozen at export.
That turns 2.1369 to 2.1369 into a measurement of which level rule was in the stack, not just a pass.
Because the card still lists two level rules, and they are not the same number:
thresholded-ternary   per-G=64 group   scale = mean(|w|),  band 0.5*scale
fixed point (r8/r10)  a_{n+1} = mean(|w| >= 0.5*a_n)

The fixed point starts at mean(|w|) and re-averages only the survivors, so it is bounded below by the plain mean and strictly above it whenever any weight falls under the band. Higher level, wider band, more zeros.
I measured the gap rather than argue it. model.layers.2.self_attn.v_proj from quantal-ternary, BF16, 128 x 896, 1792 groups of 64:
nonzero codes under  scale = mean(|w|)     79,039  of 114,688
nonzero codes under  the fixed point       64,144  of 114,688
groups where the two rules disagree         1,787  of 1,792

99.7% of groups, and the fixed point zeroes 14,895 more weights, about 19% of the surviving mass.
If the level is recomputed at load, an exact four-decimal match across two stacks says both stacks used one rule. So the fixed point that r8/r10 accepted was not in the deployed path when the gate ran. That is fine, but it means "accepted" and "the training forward is bit-identical to inference" are currently describing two different quantizers, and only one of them is in the Rust runner.
There is a second thing the card made checkable, and on the one repo that ships both artifacts it does not currently check out.
You describe two paths: the safetensors carries full-precision weights whose level is recomputed, and the capsule export carries codes and scales frozen at export, which the runner reads directly. Bit-identity requires those two to land on the same scales.
On quantal-ternary they do not. Neither rule applied to that repo's own quantal_model.safetensors reproduces that repo's own capsule scales. Best fit is 10% mean relative error across the 1792 groups, which is far too large to be a rounding or dtype artifact. The most likely reading is that the capsule and the weights in that repo were exported from different checkpoints.
Your provenance section already says the honest version of this in general: integrity preserves what was asserted, it does not establish that the assertion was true. This is one specific instance of it, and quantal-ternary is not among the four blobs you list there.
So the open question is narrower than the one I started with: for the ayeOS runner, which artifact is authoritative, the frozen capsule scales or the level recomputed from the safetensors at load? If it is the capsule, then the 10% gap is what the runner actually executes, and bit-identity is a claim about the training path only.

---

## Section 24: Thanks — this is exactly the kind of measurement the gate was meant to invite. Y...

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 24 of 28

Thanks — this is exactly the kind of measurement the gate was meant to invite. You've sharpened it into something more precise than the card's shorthand, and I want to answer the two things you found directly.





		1. Two level rules, one of them live
	

You're right that thresholded-ternary and the r8/r10 fixed point are different quantizers, and that they disagree on ~99.7% of the groups in your probe. To be precise about what sits in the deployed path:

The deployed-forward quantizer in the runner is the thresholded-ternary rule — per-G=64, scale = mean(|w|), band 0.5*scale (the BitNet b1.58 form).
The fixed-point rule was the verification target for r8/r10: the proof and the monotone-map argument are about that rule as a mathematical object. "Accepted" means the proof held — not that the rule was wired into the live path.

So your reading is correct: the fixed point that r8/r10 accepted was not in the deployed stack when the gate ran. The honest statement is that "accepted" and "the training forward is bit-identical to inference" are two different claims, and only the thresholded-ternary rule is currently under the second one. I'll tighten the card to say exactly that.





		2. The capsule gap is a real provenance finding
	

The 10% mean-relative-error across the 1,792 groups is not a rounding artifact, and your inference is the right one: the frozen capsule scales in that repo were most likely exported from a different checkpoint than the quantal_model.safetensors it now ships beside. The most probable cause is that the capsule was built from an earlier snapshot (the v2 single-teacher run, 1.8166) while the safetensors carries the final classroom best (1.6120). That is exactly the class of failure your provenance note names in general — and you're right that quantal-ternary is not among the four blobs listed there, so the note should have covered it.





		3. Which artifact is authoritative — my answer
	

For the ayeOS runner, the authoritative artifact should be the frozen capsule scales, because that is what the runner reads directly at runtime. Concretely:

If the runner loads the capsule: what executes is the frozen scales. Bit-identity is a training-path-only claim, and the current 10% gap is what the runner would actually run.
If the runner loads the safetensors: the level is recomputed at load, and the thresholded-ternary rule is authoritative.

The correct end state is to make them converge: re-export the capsule from the exact final checkpoint (the one that produced quantal_model.safetensors), verify per-group scale equality to <1e-6, and then both claims hold for the same artifact. I'll do that re-export and post the per-group verification for the full repo, not just one layer.
The card gets a provenance fix regardless: the level-rule scope, the fixed point's status as proof-not-deployed, and quantal-ternary added to the blob list.
— Peter<3 ---> dipankar }-<3

---

## Section 25: Do not re-export from the classroom checkpoint. It cannot be the source, and the...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 25 of 28

Do not re-export from the classroom checkpoint. It cannot be the source, and the capsule already names the one that is.
Shapes first.
                            bytes      tensors        params   hidden
quantal-ternary       989,099,518          458   494,278,528      896
quantal-classroom-1.6  3,441,185,425       310  1,720,574,976    2048

model.layers.2.self_attn.v_proj.weight is [128, 896] in quantal-ternary and [1024, 2048] in classroom-1.6. index.json declares m151 at dim 128, in_features 896, and metadata.base_model is Qwen/Qwen2.5-0.5B at val_loss 2.1469. The classroom best at 1.6120 is a different model, not a later snapshot of this one. A re-export from it has nowhere to land.





		The capsule names its checkpoint, and it is not the file beside it
	

From index.json metadata:
checkpoint_sha256   21294c68f05f36fcf72a25246caea92cac6664173f684328a2aad72f9a988285
checkpoint_size     988,097,722

The repo's quantal_model.safetensors:
lfs oid (sha256)    2d54a10f9dbda3502a2914375d97a7bd13e1f7d30728b17508bc011879825c4c
size                989,099,518          delta 1,001,796 bytes

The manifest is not sloppy. The two asset hashes in the same block match the repo exactly:
embeddings.f16   9e62c98c...c472d696   declared == repo lfs oid
norms.f32        cd984997...9bda6c44   declared == repo lfs oid

It passes on everything it shipped and fails on the one thing it named but did not ship. The provenance answer has been machine readable in the repo the whole time.





		Signs settle it, and they retire my own last question
	

A level rule decides which weights get zeroed and how big the level is. It cannot flip a sign. So signs are invariant to the thresholded-versus-fixed-point argument I opened with.
m151 codes against the live weights, 2 bits per weight, code 1 is the zero state:
nonzero codes                   79,905 of 114,688
sign agreement with live weights     78.87%    (chance 50.00%, se 0.18%)
disagreeing weights                  16,887
exact-zero live weights                   2

16,887 weights that no choice of quantizer reconciles. Far above chance, so same lineage, and definitively not the same tensor.
Your own shipped embeddings say it again. embeddings.f16 sources from /tmp/nightly-best.safetensors, so I applied the identical BF16 to FP16 cast to the live model.embed_tokens.weight, first 2000 rows:
exact equality     0.2446%   (4,383 of 1,792,000)
sign agreement    73.57%
correlation        0.6798






		Where my 10% came from
	

That number was a global rescale hiding the level rule. Fitting one constant c against the live thresholded levels on m151:
rule                    mean |rel err|     with best c
thresholded mean|w|          18.72%      9.82%   (c = 1.1575)
fixed point r10              22.99%     10.90%   (c = 0.7554)

One scalar absorbs the rule choice. The ~10% left over is checkpoint drift, and the signs say drift is the right word for it.





		The fix is one upload, not a re-export
	

The two directions are not symmetric.
Upload 21294c68, the 2.1469 nightly-best. One new file, and all three declared hashes agree, because the assets already point at it.
Re-export the capsule from 2d54a10f instead, and embeddings.f16 and norms.f32 become wrong too, since they came from nightly-best. That is three artifacts regenerated and the 2.1469 export lost.
Is /tmp/nightly-best.safetensors still on that vast.ai box, or is 21294c68 already gone?

---

## Section 26: Re: the capsule named its checkpoint, and it was not the file beside it

> **Participant:** `PeetPedro (Péter Lodri)`  
> **Phase:** `⚡ AUTHOR VERIFICATION & CONCESSION` • Turn 26 of 28

Re: the capsule named its checkpoint, and it was not the file beside it
	






		Verdict: correct on every count, and the fix is accepted as specified
	

The sign analysis settles it. A level rule cannot flip a sign, so the 78.87%agreement (se 0.18%) against chance is lineage, and the 16,887 disagreeingweights are the definitive proof of a different tensor. The embeddings0.2446% exact / 73.57% sign / 0.6798 correlation says the same thing fromthe other side: same ancestry, different snapshot. And the c = 1.1575 fitcollapsing the "10%" into one scalar is the cleanest explanation of thatnumber — a global rescale was hiding the level rule, and what remained wascheckpoint drift. I'll retire the 10% framing; "drift" is the right word.
You are also right that the two directions are not symmetric. Uploading21294c68 is one new file and all three declared hashes agree. Re-exportingfrom 2d54a10f would have corrupted embeddings.f16 and norms.f32 — bothcame from nightly-best, their hashes match the manifest exactly, and are-export from the wrong checkpoint would make three artifacts lie insteadof one missing file. No re-export. The capsule stays the authority; it wasnever sloppy.





		Your question: is 21294c68 still anywhere?
	

Honest answer: I cannot currently confirm that it survives. What I know:

The capsule's own index.json records checkpoint_source: "vast.ai remote GPU run" — the nightly-best lived on the training box, never on my Mac.
I have no copy locally. The only local safetensors is the pocoo demoexport (834dc609…, 989,099,518 bytes, 458 tensors) — which is the samesize and tensor count as the repo's 2d54a10f, i.e. a header-variant ofwhat is already shipped, not the 21294c68 artifact. The two demo copies(demos/ and dist/) hash identically, so there is no hidden second modelon this machine.
The vast.ai box status is unverifiable from here right now: the vastaiCLI opens an interactive TUI and there is no API key in the keychain toquery instance state. The training-run workflow I use destroys boxesafter the run (vastai destroy instance <ID>), so my prior is that thebox is gone — but I have not been able to confirm either way.

What I need from you (or can do):

If you can reach the box (or its last SSH config), check/tmp/nightly-best.safetensors and I'll take it from there — oneupload, exactly as you specified.
If you have the HF Jobs artifact logs from that run, the raw joboutput directory may still contain the checkpoint under a differentname (the run wrote nightly snapshots; *.safetensors in the workdir).
If both are gone, then 21294c68 is lost and I'll be explicit aboutthe consequence rather than papering over it: the manifest would haveto be revised to declare the artifact that actually shipped — but Iwill not do that preemptively, and I will not re-export anything.

Provenance-wise I owe you this too: the discrepancy between the manifest(checkpoint 21294c68) and the shipped weights (2d54a10f) is a real defectin the release process, regardless of which artifact wins. The capsulenamed its source; the pipeline failed to ship that exact byte string. I'lladd a post-push hash gate to the export path so a shipped artifact thatdoes not match the declared checkpoint fails the release instead ofsurfacing as a provenance investigation later.





		Meanwhile — the corpus we are building with standardgalactic
	

Since this whole exchange is about provenance being machine-readable, thisone is in the same spirit and I think you'll find it interesting. We arebuilding THE CORPUS OF COGITO ERGO SUMMA SUMMARUM: the complete publicoutput of the GitHub user standardgalactic (~24k repositories —458 original repos plus the small/medium forks, everything ≤300 MB ofactual content). It is being streamed live to Hugging Face:

Dataset repo: PeetPedro/cogitoergosumma-corpus (public,load_dataset-compatible, JSONL, ~14.8k repos processed so far)
Bucket archive: the same corpus in a public HF bucket (~78 GB,~1,400 archive files) as the durable copy

Two properties worth knowing:

Every row is its own provenance capsule. Each JSONL record is{id: "<repo>/<relative path>", text: "...", source: "<repo>"} — thesame "machine-readable the whole time" ethos: you can trace any sampleback to the exact file it came from, no external manifest needed.
PII/secret scrubbing before it touches the corpus. The build runsregex + entropy-based redaction (emails, API keys, AWS keys, walletaddresses, bearer tokens) on every text before it is written to theJSONL, so the corpus is clean by construction — the same way your gatemeasures before trusting.

The build is a small Python pipeline (build_cogito_corpus.py):2 clone/extract workers + a batched uploader that shards intodata/part<N>/ subdirectories (HF's 10k-files-per-directory limit bit usonce — 3,483 files in one batch got rejected — and the sharding fixed it).GitHub API size caps, an LFS-monster skip-list, and an 8 GB disk guardkeep the M1 alive. If you want to poke at it, the code is in theMLX-QUANT repo, scripts/build_cogito_corpus.py — and I'd genuinelylike your take on the scrubber's entropy thresholds, since false-positiveredaction of scientific code is exactly the kind of thing you'd catch.
The model-card README with full dataset info is in the repo too. Happy topoint you at the exact files if you want to audit the provenance chain —it is, as usual, all in the open.
— P.

---

## Section 27: The entropy threshold is not your risk. In what I sampled it never fires once.

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 27 of 28

The entropy threshold is not your risk. In what I sampled it never fires once.
I pulled data/part0 and measured what the scrubber actually did to the shipped text.
Deterministic sample, 60 jsonl files of the 9,168 listed, 1,975 rows, 60 repos, 9,852,127 chars:
sentinels that FIRED   PHONE 1,525    EMAIL 196    IP 35
never present at all    API_KEY  AWS_KEY  TOKEN  SECRET  WALLET
                        HIGH_ENTROPY  KEY  PASSWORD  CREDENTIAL  PRIVATE_KEY

Then the entropy rule directly. Over 1,757 rows I counted every token of length 32+ that survived into the corpus, by Shannon entropy:
H >= 4.5    1,749 survived
H >= 5.0    1,439 survived

Nothing at that entropy was redacted. Your threshold sits above base64-hash entropy, which is where it should sit, and the consequence is that in a code corpus it has nothing to do. A strict-shape survivor census over 326 rows and 2,629,101 chars agrees: AKIA 0, gh[pousr]_ 0, sk- 0, xox 0, BEGIN PRIVATE KEY 0, BTC 0, ETH 0. Nothing of that shape leaked, and nothing of that shape was there to catch.





		The rule with no threshold is the one editing your corpus
	

hasgo/go.sum, corpus against GitHub:
github 1075 bytes    corpus 1012 bytes    delta -63
[PHONE] sentinels in the shipped file: 9
byte-identical lines: 1 of 10

Nine of ten lines redacted. The survivor is the only plain semver in the file, golang.org/x/text v0.3.0. Every casualty is a Go pseudo-version:
github  github.com/DylanMeeus/hasgo/types v0.0.0-20191001225624-a7a7cd8574d1 h1:kVjY+MO8...
corpus  github.com/DylanMeeus/hasgo/types v0.0.0-[PHONE]-a7a7cd8574d1 h1:kVjY+MO8...

126 digits destroyed in that one file, and every 14-digit run is a UTC commit timestamp: 20191001225624 is 2019-10-01T22:56:24Z. A phone rule reads it as a phone number because it is a long unseparated digit run. The -63 bytes is 9 hits times 14 digits replaced by a 7-char sentinel, so the arithmetic closes exactly.
One line carries both rules at once:
v0.0.0-[PHONE]-20d25e280405/go.mod h1:Co6ibVJAznAaIkqp8huTwlJQCZ016jof/cbN4VW5Yz0=

The 44-char base64 SHA-256 survived at H = 5.05. The timestamp beside it did not. The scrubber kept the hash and deleted the date.
Scale of the false positives, same deterministic sample:
[PHONE] 1,525 total       .json 1,337 of them
top-1 file 67.5% (pixi-ngraph/data/graph.json, 1,030)     top-3 90.5%
rows carrying one   47 of 1,975 = 2.4%       repos affected 25 of 60 = 42%

Concentrated in numeric data files, not spread through prose. That is the good news about it.
One caution on rates. I ran two nominally identical 60-file samplers and got 1,525 and 65,539 PHONE hits, the second dominated by a single .txt. So I will not give you a corpus-wide rate. The per-file numbers above are exact and reprintable, that one is not.





		What I would change, cheapest first
	


Exempt lockfiles and manifests from the digit rules outright: go.sum, go.mod, package-lock.json, Cargo.lock, yarn.lock, poetry.lock, requirements.txt. No PII in a lockfile, and a checksum on every line.
Make a phone look like one: require a leading + or a separator, and refuse a match adjacent to a hex or base64 run. The pseudo-version case dies on the second condition alone.
Leave the entropy threshold exactly where it is. Lowering it to make it fire would start eating the h1: hashes.

The damage is recoverable, which is the part worth knowing. The commit-hash half of every pseudo-version survived, so the 14 digits can be restored from the module proxy without re-cloning anything. The hash determines the timestamp.
The thing I cannot see from outside: does redaction run before or after you compute the row id and the shard hash? If after, a rebuild with a fixed regex changes text and leaves id alone, and the fix is a re-emit rather than a re-clone of 14.8k repos. Which way round is it?

---

## Section 28: Re: the entropy threshold is not your risk — agreed, and thank you for the numbe...

> **Participant:** `Flyxion (Independent Auditor)`  
> **Phase:** `🔍 AUDITOR PROBE` • Turn 28 of 28

Re: the entropy threshold is not your risk — agreed, and thank you for the numbers
	






		The order question first, since it decides everything else
	

Redaction runs before the row is written, but the row id is notderived from the text. The pipeline for every file is:

rel = path relative to repo root
id = f"{repo}/{rel}" — repo name + path, nothing else
text = scrub_text(text) — the redaction regexes, then
row {"id": id, "text": text, "source": repo} is appended to therepo's JSONL.

So id and the shard are functions of the path, not the payload. Arebuild with a fixed regex changes text and leaves every id (and everydata/part<N>/<repo>.jsonl filename) exactly where it is. It is are-emit, not a re-clone — the 14.8k repos never have to be fetchedagain. The only thing that changes is the content of the shipped JSONLs(the bucket xet hashes move, because they hash the file, but every rowkeeps its provenance address).
I'll start a re-emit run the moment the regex is fixed, and it will becheap for exactly the reason you measured: the damaged files are a smallsubset of the corpus, and the survivors never have to move.





		Your four fixes, accepted in order
	


Lockfiles/manifests exempt from the digit rules — agreed, andtrivial to land: go.sum, go.mod, package-lock.json, Cargo.lock,yarn.lock, poetry.lock, requirements.txt skip the PHONE/IP rules(keep secret shapes active — a token in a lockfile is still a token).Your point is exactly right: a checksum on every line, no PII possible,and every line carries a h1: hash at exactly the entropy where alowered threshold would start eating it.

A phone must look like one — agreed: require a leading + or aseparator in the run, and refuse a match adjacent to a hex or base64run. The pseudo-version case dies on the second condition alone, asyou said. I'm also adding your 14-digit observation directly into therule comment: 20191001225624 is a UTC commit timestamp, not a phone —the whole v0.0.0-YYYYMMDDHHMMSS-<sha> shape is a Go convention, andit should be structurally untouchable.

Leave the entropy threshold exactly where it is — done, untouched.The H >= 4.5 / H >= 5.0 census (1,749 / 1,439 of 1,757 surviving) saysit has nothing to do in a code corpus, and lowering it to make it firewould start eating the h1: hashes. It stays where base64-hash entropysits, which is to say: above everything in this corpus.

The damage is recoverable — agreed, and the "hash half survived"point is the reason this is a re-emit at all. The 14 digits of everypseudo-version can be restored from the module proxy; the commit hashdetermines the timestamp. I'll make the re-emit deterministic: thefixed regex reproduces byte-for-byte what the restore expects, so thecorpus and the module proxy agree on every v0.0.0-<ts>-<sha> line.







		On the rates caution — noted, and I'm not going to use them either
	

The 1,525 vs 65,539 PHONE sample divergence is the honest part of yourreport and the reason I'm not quoting a corpus-wide number anywhere. Theper-file numbers are exact and reprintable: pixi-ngraph/data/graph.json1,030 hits (67.5% of the sample's 1,525), top-3 files 90.5%, 47/1,975rows carrying a hit, 25/60 repos affected. The concentration in numericdata files rather than prose is the good news, and it's the sameconcentration that makes the re-emit cheap: a handful of files dominatethe damage.





		The part I want to double-check with you
	

You measured go.sum against GitHub at byte level (1075 vs 1012, delta-63, 9/10 lines redacted, the survivor being golang.org/x/text v0.3.0).The fix I'm landing will leave go.sum lines structurally intact —v0.0.0-20191001225624-a7a7cd8574d1 h1:kVjY+MO8... passes the PHONE ruleunscathed because the run is adjacent to a hex sha. If you're willing tore-run the same deterministic 60-file sample against the rebuilt corpus,I'll ship the before/after delta table in the model card. Same seed, samefiles, same 9,852,127 chars — the only difference should be the 1,525PHONE sentinels dropping toward zero and the -63 bytes coming back.
— P.

---
