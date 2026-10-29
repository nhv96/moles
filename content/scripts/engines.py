"""Voice engines: each one turns text into speech for a language.

An engine is chosen per language in languages.json ("engine"). Only "kokoro" exists so far. The
"recording" engine (the user's own voice) is planned (see docs/content-pipeline-plan.md, task 8);
it works from recorded files rather than from text, so it will need its own entry point next to
synth().
"""

from __future__ import annotations

import numpy as np


class EngineError(Exception):
    """The engine of a language cannot be used."""


class Engine:
    """Makes speech for one language."""

    voice: str  # name written in the manifest
    sample_rate: int

    def synth(self, text: str, speed: float) -> np.ndarray:
        """Speak text at the given speed; returns mono float audio at sample_rate."""
        raise NotImplementedError


def to_numpy(audio) -> np.ndarray:
    """Kokoro may return a torch tensor or a numpy array; always give numpy."""
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    return np.asarray(audio, dtype=np.float32)


class KokoroEngine(Engine):
    sample_rate = 24000  # Kokoro output rate

    def __init__(self, voice: str, lang_code: str):
        # Imported here so argument errors show up before the slow Kokoro import.
        from kokoro import KPipeline

        self.voice = voice
        self._pipeline = KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")

    def synth(self, text: str, speed: float) -> np.ndarray:
        """Run one text through the pipeline and join the returned chunks."""
        chunks = []
        for result in self._pipeline(text, voice=self.voice, speed=speed):
            # Newer kokoro versions yield an object with .audio, older ones a tuple.
            audio = result.audio if hasattr(result, "audio") else result[2]
            if audio is not None:
                chunks.append(to_numpy(audio))
        if not chunks:
            raise RuntimeError(f"No audio produced for: {text!r}")
        return np.concatenate(chunks)


def create_engine(lang_code: str, settings: dict) -> Engine:
    """Create the engine a language asks for. settings is its entry in languages.json."""
    kind = settings["engine"]
    if kind == "kokoro":
        return KokoroEngine(settings["voice"], settings["kokoro_lang_code"])
    if kind == "recording":
        raise EngineError(f"language {lang_code!r} is recorded, and the recording engine is not built yet")
    raise EngineError(f"language {lang_code!r} uses an unknown engine {kind!r}")
