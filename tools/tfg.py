"""Run the original game's native rule engine (lib/armeabi-v7a/libTFG.so from the 7.0.16 APK) under Unicorn.

The library exports  void ai_init();  void ai_cmd(const char *json);  const char *get_g_ss();
Everything it imports from Android's libc / libm / libdl is implemented below in Python.

    from tfg import TFG
    eng = TFG("libTFG.so"); print(eng.cmd('{"cmd":"ping"}'))
"""
import math, os, struct, sys, time
from unicorn import Uc, UcError, UC_ARCH_ARM, UC_MODE_ARM, UC_HOOK_CODE, UC_HOOK_MEM_UNMAPPED
from unicorn.arm_const import *

BASE, STUB, HEAP, STACK, MISC, CMDBUF = 0x10000000, 0x0F000000, 0x30000000, 0x7F000000, 0x0E000000, 0x0D000000
HEAP_SIZE, STACK_SIZE, CMDBUF_SIZE = 0x08000000, 0x00800000, 0x00800000
ALLOC, NATIVE = MISC + 0xC000, STUB + 0xA000

# The hot libc routines run as ARM code inside the guest (as Python hooks they cost ~25k callbacks per command).
# Allocator: 8-byte header holding the block size; free lists per 16-byte size class up to 1024, then per power of two.
NATIVE_ASM = [
    ("malloc", """
        add r0, r0, #23
        bic r0, r0, #15
        movw r3, #{alo}
        movt r3, #{ahi}
        cmp r0, #1024
        bhi large
        add r2, r3, r0, lsr #2
    take:
        ldr r1, [r2]
        cmp r1, #0
        beq bump
        ldr r12, [r1, #8]
        str r12, [r2]
        add r0, r1, #8
        bx lr
    bump:
        ldr r1, [r3]
        add r12, r1, r0
        str r12, [r3]
        str r0, [r1]
        add r0, r1, #8
        bx lr
    large:
        sub r1, r0, #1
        clz r1, r1
        rsb r1, r1, #32
        mov r0, #1
        lsl r0, r0, r1
        add r2, r3, #260
        add r2, r2, r1, lsl #2
        b take"""),
    ("free", """
        cmp r0, #0
        bxeq lr
        sub r0, r0, #8
        ldr r1, [r0]
        movw r3, #{alo}
        movt r3, #{ahi}
        cmp r1, #1024
        addls r2, r3, r1, lsr #2
        bls push
        sub r12, r1, #1
        clz r12, r12
        rsb r12, r12, #32
        add r2, r3, #260
        add r2, r2, r12, lsl #2
    push:
        ldr r12, [r2]
        str r12, [r0, #8]
        str r0, [r2]
        bx lr"""),
    ("__aeabi_memcpy", """
        mov r12, r0
    words:
        cmp r2, #4
        blo bytes
        ldr r3, [r1], #4
        str r3, [r12], #4
        sub r2, r2, #4
        b words
    bytes:
        cmp r2, #0
        bxeq lr
        ldrb r3, [r1], #1
        strb r3, [r12], #1
        sub r2, r2, #1
        b bytes"""),
    ("__aeabi_memmove", """
        cmp r0, r1
        bls {__aeabi_memcpy}
        add r3, r1, r2
        cmp r0, r3
        bhs {__aeabi_memcpy}
    back:
        cmp r2, #0
        bxeq lr
        sub r2, r2, #1
        ldrb r3, [r1, r2]
        strb r3, [r0, r2]
        b back"""),
    ("__aeabi_memset", """
        mov r12, r0
        and r2, r2, #255
        orr r2, r2, r2, lsl #8
        orr r2, r2, r2, lsl #16
    words:
        cmp r1, #4
        blo bytes
        str r2, [r12], #4
        sub r1, r1, #4
        b words
    bytes:
        cmp r1, #0
        bxeq lr
        strb r2, [r12], #1
        sub r1, r1, #1
        b bytes"""),
    ("memcmp", """
        mov r12, r0
        mov r0, #0
    next:
        cmp r2, #0
        bxeq lr
        ldrb r0, [r12], #1
        ldrb r3, [r1], #1
        subs r0, r0, r3
        bxne lr
        sub r2, r2, #1
        b next"""),
    ("strlen", """
        mov r1, r0
    next:
        ldrb r2, [r1], #1
        cmp r2, #0
        bne next
        sub r0, r1, r0
        sub r0, r0, #1
        bx lr"""),
    ("calloc", """
        mul r2, r0, r1
        push {{r4, r5, r6, lr}}
        mov r4, r2
        mov r0, r2
        bl {malloc}
        mov r5, r0
        mov r1, r4
        mov r2, #0
        bl {__aeabi_memset}
        mov r0, r5
        pop {{r4, r5, r6, pc}}"""),
    ("realloc", """
        cmp r0, #0
        moveq r0, r1
        beq {malloc}
        ldr r2, [r0, #-8]
        sub r2, r2, #8
        cmp r1, r2
        bxls lr
        push {{r4, r5, r6, lr}}
        mov r4, r0
        mov r5, r2
        mov r0, r1
        bl {malloc}
        mov r6, r0
        mov r1, r4
        mov r2, r5
        bl {__aeabi_memcpy}
        mov r0, r4
        bl {free}
        mov r0, r6
        pop {{r4, r5, r6, pc}}"""),
]


def assemble_native():
    from keystone import Ks, KS_ARCH_ARM, KS_MODE_ARM
    ks, addr, out, blob = Ks(KS_ARCH_ARM, KS_MODE_ARM), NATIVE, {}, b""
    for name, src in NATIVE_ASM:
        code, _ = ks.asm(src.format(alo=ALLOC & 0xFFFF, ahi=ALLOC >> 16, **{k: "%#x" % v for k, v in out.items()}), addr)
        out[name] = addr; blob += bytes(code); addr += len(code)
    return out, blob
M32 = 0xFFFFFFFF
u32 = lambda b, o=0: struct.unpack_from("<I", b, o)[0]
s32 = lambda v: v - (1 << 32) if v & 0x80000000 else v
d2w = lambda d: struct.unpack("<II", struct.pack("<d", d))
w2d = lambda lo, hi: struct.unpack("<d", struct.pack("<II", lo, hi))[0]
f2w = lambda f: struct.unpack("<I", struct.pack("<f", f))[0]
w2f = lambda w: struct.unpack("<f", struct.pack("<I", w))[0]


class EngineAbort(Exception):
    pass


class TFG:
    def __init__(self, lib, trace=False):
        """lib: path to libTFG.so, or its bytes (e.g. read straight out of the APK)."""
        self.trace = trace
        self.img = lib if isinstance(lib, (bytes, bytearray)) else open(lib, "rb").read()
        self.uc = uc = Uc(UC_ARCH_ARM, UC_MODE_ARM)
        self.files, self.tls, self.opened = {}, {}, []
        for base, size in ((HEAP, HEAP_SIZE), (STACK, STACK_SIZE), (STUB, 0x10000), (MISC, 0x10000), (CMDBUF, CMDBUF_SIZE)):
            uc.mem_map(base, size)
        self.native, blob = assemble_native()
        uc.mem_write(NATIVE, blob)
        uc.mem_write(ALLOC, struct.pack("<I", HEAP + 0x1000))
        self._load()
        # FPU on (the code uses VFP instructions with the softfp calling convention)
        uc.reg_write(UC_ARM_REG_C1_C0_2, uc.reg_read(UC_ARM_REG_C1_C0_2) | (0xF << 20))
        uc.reg_write(UC_ARM_REG_FPEXC, 0x40000000)
        uc.reg_write(UC_ARM_REG_C13_C0_3, MISC + 0x8000)
        # ARM Linux kernel user helpers the code jumps to directly: cmpxchg, memory barrier, get_tls, cmpxchg64
        uc.mem_map(0xFFFF0000, 0x1000)
        uc.mem_write(0xFFFF0FC0, struct.pack("<5I", 0xE5923000, 0xE0533000, 0x05821000, 0xE2730000, 0xE12FFF1E))
        uc.mem_write(0xFFFF0FA0, struct.pack("<I", 0xE12FFF1E))
        uc.mem_write(0xFFFF0FE0, struct.pack("<2I", 0xEE1D0F70, 0xE12FFF1E))
        uc.mem_write(0xFFFF0F60, struct.pack("<I", 0xE12FFF1E))
        uc.hook_add(UC_HOOK_CODE, self._cmpxchg64, begin=0xFFFF0F60, end=0xFFFF0F60)
        uc.hook_add(UC_HOOK_CODE, self._on_stub, begin=STUB, end=STUB + 4 * len(self.imports))
        uc.hook_add(UC_HOOK_MEM_UNMAPPED, self._on_unmapped)
        for fn in self.init_array:
            self.call(fn, 0, 0, 0)
        self.call(self.sym["ai_init"])

    # ---------------------------------------------------------------- ELF loading
    def _load(self):
        img, uc = self.img, self.uc
        phoff, phentsize, phnum = u32(img, 28), *struct.unpack_from("<H", img, 42), struct.unpack_from("<H", img, 44)[0]
        segs, dyn = [], None
        for i in range(phnum):
            t, off, va, _, fsz, msz, _, _ = struct.unpack_from("<8I", img, phoff + i * phentsize)
            if t == 1: segs.append((off, va, fsz, msz))
            elif t == 2: dyn = (va, fsz)
            elif t == 0x70000001: self.exidx = (BASE + va, fsz // 8)
        top = max(va + msz for _, va, _, msz in segs)
        uc.mem_map(BASE, (top + 0xFFFF) & ~0xFFFF)
        for off, va, fsz, _ in segs:
            uc.mem_write(BASE + va, img[off:off + fsz])
        rd = lambda va: u32(uc.mem_read(BASE + va, 4))
        D = {}
        for o in range(0, dyn[1], 8):
            tag, val = rd(dyn[0] + o), rd(dyn[0] + o + 4)
            if tag == 0: break
            D[tag] = val
        strtab, symtab, nsym = D[5], D[6], rd(D[4] + 4)
        raw = bytes(uc.mem_read(BASE, top))
        cstr = lambda o: raw[o:raw.index(b"\0", o)].decode("latin1")
        self.sym, self.imports, symaddr = {}, [], []
        # data objects the library imports
        objs = {"__stack_chk_guard": self._blob(struct.pack("<I", 0x5AFE5AFE)), "__sF": self._blob(bytes(3 * 84)),
                "_tolower_tab_": 0, "_toupper_tab_": 0}
        for name, fn in (("_tolower_tab_", lambda c: c + 32 if 65 <= c <= 90 else c), ("_toupper_tab_", lambda c: c - 32 if 97 <= c <= 122 else c)):
            tab = self._blob(struct.pack("<257h", -1, *[fn(c) for c in range(256)]))
            objs[name] = self._blob(struct.pack("<I", tab))
        self.sF = objs["__sF"]
        for i in range(nsym):
            name, value, size, info, other, shndx = struct.unpack_from("<IIIBBH", raw, symtab + i * 16)
            n = cstr(strtab + name)
            if shndx:
                addr = BASE + value; self.sym[n] = addr
            elif not n:
                addr = 0
            elif n in objs:
                addr = objs[n]
            elif n in self.native:
                addr = self.native[n]
            else:
                addr = STUB + 4 * len(self.imports); self.imports.append(n)
            symaddr.append(addr)
        # import stubs: "bx lr"; the hook does the work. pthread_once has to call back into guest code, so it is real ARM.
        once = STUB + 0x8000
        uc.mem_write(STUB, struct.pack("<I", 0xE12FFF1E) * 0x2000)
        uc.mem_write(once, struct.pack("<9I", 0xE92D4010, 0xE5902000, 0xE3520000, 0x1A000002, 0xE3A02001, 0xE5802000,
                                       0xE12FFF31, 0xE3A00000, 0xE8BD8010))
        self.ret = STUB + 0x9000
        for i, n in enumerate(self.imports):
            if n == "pthread_once":
                symaddr = [once if a == STUB + 4 * i else a for a in symaddr]
        def relocs(tag, sztag):
            if tag in D:
                for o in range(D[tag], D[tag] + D[sztag], 8):
                    yield rd(o), rd(o + 4)
        for off, info in list(relocs(17, 18)) + list(relocs(23, 2)):
            typ, si = info & 0xFF, info >> 8
            where = BASE + off
            cur = u32(uc.mem_read(where, 4))
            if typ == 23: val = cur + BASE
            elif typ == 2: val = cur + symaddr[si]
            elif typ in (21, 22): val = symaddr[si]
            else: raise NotImplementedError("reloc %d" % typ)
            uc.mem_write(where, struct.pack("<I", val & M32))
        n = D.get(27, 0) // 4
        self.init_array = [a for a in struct.unpack("<%dI" % n, uc.mem_read(BASE + D[25], 4 * n)) if a not in (0, M32)] if n else []

    def _blob(self, data):
        if not hasattr(self, "_misc"): self._misc = MISC
        a = self._misc; self.uc.mem_write(a, data); self._misc = (a + len(data) + 15) & ~15
        return a

    # ---------------------------------------------------------------- guest helpers
    def call(self, addr, *args):
        uc = self.uc
        for reg, v in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            uc.reg_write(reg, v & M32)
        uc.reg_write(UC_ARM_REG_SP, STACK + STACK_SIZE - 0x1000)
        uc.reg_write(UC_ARM_REG_LR, self.ret)
        try:
            uc.emu_start(addr, self.ret)
        except UcError as e:
            raise EngineAbort("%s at pc=%#x lr=%#x (%s)" % (e, uc.reg_read(UC_ARM_REG_PC), uc.reg_read(UC_ARM_REG_LR), getattr(self, "fault", "")))
        if getattr(self, "aborted", None):
            msg, self.aborted = self.aborted, None
            raise EngineAbort(msg)
        return uc.reg_read(UC_ARM_REG_R0)

    def cmd(self, text):
        """Send one command to the engine and return its reply string."""
        data = text.encode() + b"\0"
        if len(data) > CMDBUF_SIZE: raise EngineAbort("command too long")
        self.uc.mem_write(CMDBUF, data)
        self.call(self.sym["ai_cmd"], CMDBUF)
        return self.cstr(self.call(self.sym["get_g_ss"])).decode("utf-8", "replace")

    def cstr(self, a, limit=1 << 24):
        out, uc = bytearray(), self.uc
        while len(out) < limit:
            chunk = bytes(uc.mem_read(a + len(out), 256))
            i = chunk.find(b"\0")
            if i >= 0: return bytes(out + chunk[:i])
            out += chunk
        return bytes(out)

    def malloc(self, n):
        """Host-side allocation in the guest allocator's block format, so the guest's free() can take it back."""
        total = (n + 23) & ~15
        if total > 1024: total = 1 << (total - 1).bit_length()
        uc = self.uc; brk = u32(uc.mem_read(ALLOC, 4))
        if brk + total > HEAP + HEAP_SIZE: raise EngineAbort("guest heap exhausted")
        uc.mem_write(ALLOC, struct.pack("<I", brk + total)); uc.mem_write(brk, struct.pack("<I", total))
        return brk + 8

    def _cmpxchg64(self, uc, addr, size, _):  # (old*, new*, ptr): r0 = 0 and carry set when swapped
        old, new, ptr = (uc.reg_read(UC_ARM_REG_R0 + i) for i in range(3))
        same = bytes(uc.mem_read(ptr, 8)) == bytes(uc.mem_read(old, 8))
        if same: uc.mem_write(ptr, bytes(uc.mem_read(new, 8)))
        cpsr = uc.reg_read(UC_ARM_REG_CPSR)
        uc.reg_write(UC_ARM_REG_CPSR, cpsr | 1 << 29 if same else cpsr & ~(1 << 29))
        uc.reg_write(UC_ARM_REG_R0, 0 if same else 1)

    def _on_unmapped(self, uc, access, addr, size, value, _):
        self.fault = "unmapped access %#x size %d" % (addr, size)
        return False

    # ---------------------------------------------------------------- libc
    def _on_stub(self, uc, addr, size, _):
        name = self.imports[(addr - STUB) // 4]
        R = lambda i: uc.reg_read(UC_ARM_REG_R0 + i)
        stack = lambda i: u32(uc.mem_read(uc.reg_read(UC_ARM_REG_SP) + 4 * i, 4))
        if self.trace: print("  [%s] %#x %#x %#x %#x" % (name, R(0), R(1), R(2), R(3)), file=sys.stderr)
        fn = getattr(self, "c_" + name, None)
        if fn is None:
            fn = MATH.get(name)
            if fn is None:
                self.aborted = "unimplemented import " + name; uc.emu_stop(); return
            args = [w2d(R(2 * i), R(2 * i + 1)) for i in range(2 if name in MATH2 else 1)]
            try: r = fn(*args)
            except OverflowError: r = math.inf
            except ValueError:  # C returns -inf / NaN where Python raises
                r = -math.inf if name in ("log", "log10", "log1p", "logb") and args[0] in (0.0, -1.0) else math.nan
            lo, hi = d2w(float(r)); uc.reg_write(UC_ARM_REG_R0, lo); uc.reg_write(UC_ARM_REG_R1, hi); return
        r = fn(uc, R, stack)
        if r is None: return
        if isinstance(r, float): r = d2w(r)
        if isinstance(r, tuple):
            uc.reg_write(UC_ARM_REG_R0, r[0] & M32); uc.reg_write(UC_ARM_REG_R1, r[1] & M32)
        else:
            uc.reg_write(UC_ARM_REG_R0, int(r) & M32)

    def _die(self, uc, msg):
        self.aborted = msg; uc.emu_stop()

    # memory / strings
    def c_strcmp(self, uc, R, S):
        a, b = self.cstr(R(0)), self.cstr(R(1)); return (a > b) - (a < b)
    def c_strncasecmp(self, uc, R, S):
        a, b = self.cstr(R(0))[:R(2)].lower(), self.cstr(R(1))[:R(2)].lower(); return (a > b) - (a < b)
    def c_memcmp(self, uc, R, S):
        a, b = bytes(uc.mem_read(R(0), R(2))), bytes(uc.mem_read(R(1), R(2))); return (a > b) - (a < b)
    def c_memchr(self, uc, R, S):
        i = bytes(uc.mem_read(R(0), R(2))).find(bytes([R(1) & 255])); return R(0) + i if i >= 0 else 0
    def c_strcpy(self, uc, R, S): uc.mem_write(R(0), self.cstr(R(1)) + b"\0"); return R(0)
    def c_strlcpy(self, uc, R, S):
        s = self.cstr(R(1))
        if R(2): uc.mem_write(R(0), s[:R(2) - 1] + b"\0")
        return len(s)
    def c_wcscmp(self, uc, R, S):
        i = 0
        while True:
            a, b = u32(uc.mem_read(R(0) + i, 4)), u32(uc.mem_read(R(1) + i, 4))
            if a != b or not a: return (a > b) - (a < b)
            i += 4
    def c_isspace(self, uc, R, S): return int(R(0) in (9, 10, 11, 12, 13, 32))
    def c_isblank(self, uc, R, S): return int(R(0) in (9, 32))
    def c_isupper(self, uc, R, S): return int(65 <= R(0) <= 90)
    def c_tolower(self, uc, R, S): return R(0) + 32 if 65 <= R(0) <= 90 else R(0)
    def c_toupper(self, uc, R, S): return R(0) - 32 if 97 <= R(0) <= 122 else R(0)

    # numbers
    def _strto(self, uc, R, bits, signed):
        s, base = self.cstr(R(0), 256), R(2)
        i = 0
        while i < len(s) and s[i] in b" \t\n\v\f\r": i += 1
        neg = False
        if i < len(s) and s[i] in b"+-": neg = s[i] == 45; i += 1
        if base in (0, 16) and s[i:i + 2].lower() == b"0x": base, i = 16, i + 2
        elif base == 0: base = 8 if s[i:i + 1] == b"0" else 10
        j, v = i, 0
        while j < len(s):
            c = s[j]; dgt = c - 48 if 48 <= c <= 57 else (c | 32) - 87 if 97 <= (c | 32) <= 122 else 99
            if dgt >= base: break
            v = v * base + dgt; j += 1
        if j == i: j = 0
        if R(1): uc.mem_write(R(1), struct.pack("<I", R(0) + j))
        v = -v if neg else v
        if signed: v = max(-(1 << (bits - 1)), min((1 << (bits - 1)) - 1, v))
        v &= (1 << bits) - 1
        return v if bits == 32 else (v & M32, v >> 32)
    def c_strtol(self, uc, R, S): return self._strto(uc, R, 32, True)
    def c_strtoul(self, uc, R, S): return self._strto(uc, R, 32, False)
    def c_strtoll(self, uc, R, S): return self._strto(uc, R, 64, True)
    def c_strtoull(self, uc, R, S): return self._strto(uc, R, 64, False)
    def c_atoi(self, uc, R, S):
        s = self.cstr(R(0), 64).strip().decode("latin1"); n = 0
        for k in range(len(s), 0, -1):
            try: n = int(s[:k]); break
            except ValueError: pass
        return n
    def c_ceilf(self, uc, R, S): return f2w(math.ceil(w2f(R(0))))
    def c_nextafterf(self, uc, R, S): return f2w(math.nextafter(w2f(R(0)), w2f(R(1))))
    def c___isfinite(self, uc, R, S): return int(math.isfinite(w2d(R(0), R(1))))
    def c___signbit(self, uc, R, S): return R(1) >> 31
    def c___fpclassifyd(self, uc, R, S):
        d = w2d(R(0), R(1)); return 1 if math.isinf(d) else 2 if math.isnan(d) else 16 if d == 0 else 8 if abs(d) < 2.2250738585072014e-308 else 4
    def c_scalbn(self, uc, R, S): return math.ldexp(w2d(R(0), R(1)), s32(R(2)))
    c_scalbnl = c_scalbn
    def c_modf(self, uc, R, S):
        frac, whole = math.modf(w2d(R(0), R(1))); uc.mem_write(R(2), struct.pack("<d", whole)); return frac
    def c_lrint(self, uc, R, S): return round(w2d(R(0), R(1)))
    def c_llrint(self, uc, R, S):
        v = round(w2d(R(0), R(1))) & ((1 << 64) - 1); return (v & M32, v >> 32)
    def c_remquo(self, uc, R, S):
        x, y = w2d(R(0), R(1)), w2d(R(2), R(3)); r = math.remainder(x, y)
        uc.mem_write(S(0), struct.pack("<i", int(round((x - r) / y)) & 7)); return r

    # printf family
    def _format(self, fmt, nxt):
        """fmt: bytes; nxt(kind) pulls the next vararg: 'i' 32-bit, 'q' 64-bit, 'd' double."""
        out, i = bytearray(), 0
        while i < len(fmt):
            c = fmt[i]
            if c != 37: out.append(c); i += 1; continue
            j = i + 1
            while j < len(fmt) and chr(fmt[j]) in "-+ #0123456789.*hlLqjzt": j += 1
            spec, conv = fmt[i + 1:j].decode(), chr(fmt[j]) if j < len(fmt) else "%"
            i = j + 1
            if conv == "%": out.append(37); continue
            while "*" in spec: spec = spec.replace("*", str(s32(nxt("i"))), 1)
            wide = spec.count("l") >= 2 or "q" in spec or "j" in spec
            flags = spec.replace("l", "").replace("h", "").replace("L", "").replace("q", "").replace("j", "").replace("z", "").replace("t", "")
            if conv in "di":
                v = nxt("q") if wide else s32(nxt("i"))
                if wide and v >= 1 << 63: v -= 1 << 64
                out += (("%" + flags + "d") % v).encode()
            elif conv in "uxXo":
                v = nxt("q") if wide else nxt("i")
                out += ("%" + flags + ("d" if conv == "u" else conv)).__mod__(v).encode()
            elif conv in "fFeEgGaA":
                out += ("%" + flags + (conv if conv not in "aA" else "g")).__mod__(nxt("d")).encode()
            elif conv == "s":
                a = nxt("i"); s = self.cstr(a) if a else b"(null)"
                out += ("%" + flags + "s").__mod__(s.decode("latin1")).encode("latin1")
            elif conv == "c": out.append(nxt("i") & 255)
            elif conv == "p": out += b"0x%x" % nxt("i")
            else: out += b"%" + spec.encode() + conv.encode()
        return bytes(out)
    def _va(self, uc, ap):
        pos = [ap]
        def nxt(kind):
            if kind == "i":
                v = u32(uc.mem_read(pos[0], 4)); pos[0] += 4; return v
            pos[0] = (pos[0] + 7) & ~7
            raw = bytes(uc.mem_read(pos[0], 8)); pos[0] += 8
            return struct.unpack("<d" if kind == "d" else "<Q", raw)[0]
        return nxt
    def _regs(self, uc, R, S, first):
        """Varargs that start in registers (r<first>..r3) and continue on the stack."""
        pos = [first]
        word = lambda k: R(k) if k < 4 else S(k - 4)
        def nxt(kind):
            if kind == "i":
                v = word(pos[0]); pos[0] += 1; return v
            pos[0] += pos[0] & 1
            lo, hi = word(pos[0]), word(pos[0] + 1); pos[0] += 2
            return w2d(lo, hi) if kind == "d" else lo | hi << 32
        return nxt
    def c_vasprintf(self, uc, R, S):
        s = self._format(self.cstr(R(1)), self._va(uc, R(2)))
        a = self.malloc(len(s) + 1); uc.mem_write(a, s + b"\0"); uc.mem_write(R(0), struct.pack("<I", a)); return len(s)
    def c_fprintf(self, uc, R, S):
        s = self._format(self.cstr(R(1)), self._regs(uc, R, S, 2)); self._write(R(0), s); return len(s)
    def _scan(self, uc, text, fmt, nxt):
        """Enough of scanf for libc++'s number parsing: %d %u %x %lld %llu %f %lf %lg %Lg %p."""
        import re
        n, pos, i = 0, 0, 0
        while i < len(fmt):
            if fmt[i] != 37:
                if chr(fmt[i]).isspace():
                    while pos < len(text) and chr(text[pos]).isspace(): pos += 1
                elif pos < len(text) and text[pos] == fmt[i]: pos += 1
                else: break
                i += 1; continue
            j = i + 1
            while chr(fmt[j]) in "hlLqjzt0123456789": j += 1
            spec, conv = fmt[i + 1:j].decode(), chr(fmt[j]); i = j + 1
            while pos < len(text) and chr(text[pos]).isspace(): pos += 1
            rest = text[pos:].decode("latin1")
            if conv in "diuxXp":
                m = re.match(r"[+-]?(0[xX])?[0-9a-fA-F]+" if conv in "xXp" else r"[+-]?\d+", rest)
                if not m: break
                v = int(m.group(), 16 if conv in "xXp" else 10); wide = spec.count("l") >= 2 or "q" in spec
                uc.mem_write(nxt("i"), struct.pack("<Q" if wide else "<I", v & ((1 << (64 if wide else 32)) - 1)))
            elif conv in "fFeEgG":
                m = re.match(r"[+-]?(inf(inity)?|nan|(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?))", rest, re.I)
                if not m: break
                v = float(m.group()); uc.mem_write(nxt("i"), struct.pack("<d", v) if "l" in spec or "L" in spec else struct.pack("<f", v))
            else: break
            pos += m.end(); n += 1
        return n
    def c_vsscanf(self, uc, R, S): return self._scan(uc, self.cstr(R(0)), self.cstr(R(1)), self._va(uc, R(2)))
    def c_sscanf(self, uc, R, S): return self._scan(uc, self.cstr(R(0)), self.cstr(R(1)), self._regs(uc, R, S, 2))

    # stdio: stdout/stderr go to the host's stderr; files are served from the host only when explicitly allowed
    def _write(self, stream, data):
        f = self.files.get(stream)
        if f: f.write(data)
        else: sys.stderr.write(data.decode("utf-8", "replace"))
    def c_fopen(self, uc, R, S):
        path, mode = self.cstr(R(0)).decode("utf-8", "replace"), self.cstr(R(1)).decode()
        self.opened.append((path, mode))
        return 0
    def c_fclose(self, uc, R, S):
        f = self.files.pop(R(0), None)
        if f: f.close()
        return 0
    def c_fwrite(self, uc, R, S):
        self._write(R(3), bytes(uc.mem_read(R(0), R(1) * R(2)))); return R(2)
    def c_fputc(self, uc, R, S): self._write(R(1), bytes([R(0) & 255])); return R(0)
    c_fputwc = c_fputc
    def c_fflush(self, uc, R, S): return 0
    def c_fread(self, uc, R, S): return 0
    def c_fseeko(self, uc, R, S): return -1
    def c_ftello(self, uc, R, S): return -1
    def c_open(self, uc, R, S):
        self.opened.append((self.cstr(R(0)).decode("utf-8", "replace"), "open")); return 99
    def c_read(self, uc, R, S): uc.mem_write(R(1), os.urandom(R(2))); return R(2)
    def c_close(self, uc, R, S): return 0

    # threads (the engine is single threaded), time, environment
    def _zero(self, uc, R, S): return 0
    c_pthread_mutex_lock = c_pthread_mutex_unlock = c_pthread_mutex_trylock = c_pthread_mutex_init = c_pthread_mutex_destroy = _zero
    c_pthread_mutexattr_init = c_pthread_mutexattr_settype = c_pthread_mutexattr_destroy = _zero
    c_pthread_cond_wait = c_pthread_cond_broadcast = c_pthread_cond_signal = c_pthread_cond_destroy = c_pthread_cond_timedwait = _zero
    c_pthread_join = c_pthread_detach = c_pthread_key_delete = c_sched_yield = c_nanosleep = _zero
    c___cxa_atexit = c___cxa_finalize = c_getenv = c_dlopen = c_dlsym = _zero
    def c_pthread_self(self, uc, R, S): return 1
    def c_pthread_equal(self, uc, R, S): return int(R(0) == R(1))
    def c_pthread_key_create(self, uc, R, S):
        key = len(self.tls) + 1; self.tls[key] = 0; uc.mem_write(R(0), struct.pack("<I", key)); return 0
    def c_pthread_getspecific(self, uc, R, S): return self.tls.get(R(0), 0)
    def c_pthread_setspecific(self, uc, R, S): self.tls[R(0)] = R(1); return 0
    def c_gettimeofday(self, uc, R, S):
        t = time.time(); uc.mem_write(R(0), struct.pack("<II", int(t), int(t % 1 * 1e6))); return 0
    def c_sysconf(self, uc, R, S): return 4096 if R(0) in (39, 40) else 1
    def c___errno(self, uc, R, S):
        if not hasattr(self, "_errno"): self._errno = self._blob(bytes(4))
        return self._errno
    def c_strerror(self, uc, R, S):
        if not hasattr(self, "_err"): self._err = self._blob(b"error\0")
        return self._err
    def c_setlocale(self, uc, R, S):
        if not hasattr(self, "_loc"): self._loc = self._blob(b"C\0")
        return self._loc
    def c_strftime(self, uc, R, S): uc.mem_write(R(0), b"\0"); return 0
    def c_dl_unwind_find_exidx(self, uc, R, S):
        uc.mem_write(R(1), struct.pack("<I", self.exidx[1])); return self.exidx[0]
    def c_abort(self, uc, R, S): self._die(uc, "abort() called, lr=%#x" % uc.reg_read(UC_ARM_REG_LR))
    c_raise = c_abort
    def c___stack_chk_fail(self, uc, R, S): self._die(uc, "stack check failed")
    def c___assert2(self, uc, R, S):
        self._die(uc, "assert failed: %s:%d %s: %s" % (self.cstr(R(0)).decode(), R(1), self.cstr(R(2)).decode(), self.cstr(R(3)).decode()))


MATH = {n: getattr(math, n) for n in "log sqrt acos asin atan atan2 cos cosh exp fmod pow sin sinh tan tanh acosh asinh atanh cbrt erf erfc expm1 hypot lgamma log1p log10 remainder exp2".split()}
MATH.update(nextafter=math.nextafter, tgamma=math.gamma, logb=lambda x: float(math.frexp(x)[1] - 1), nearbyint=lambda x: float(round(x)), rint=lambda x: float(round(x)))
MATH2 = {"atan2", "fmod", "pow", "hypot", "remainder", "nextafter"}  # two double arguments (softfp: r0:r1, r2:r3)

if __name__ == "__main__":
    eng = TFG(sys.argv[1], trace="--trace" in sys.argv)
    print("init ok; files the engine tried to open:", eng.opened)
    for line in sys.argv[2:]:
        if not line.startswith("--"): print(">", line); print("<", eng.cmd(line))
