# Tiny Stack VM

A fast, exact interpreter for make.fun's tiny stack ISA v1
(competition `tiny-stack-vm-01-run-20261122`).

`main.ts` (Node 22, stdlib only) runs every instance in `/input/<id>/`
(`program.bin` + `input.bin`) and writes `/output/<id>/stdout.bin` and
`/output/<id>/exit.txt`: 32-bit wrapping arithmetic, a 256-value stack,
256 words of memory, branches, calls, input/output, and all ten traps
with their own exit codes, exactly as the reference VM defines them.

Local run on the practice set:

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
