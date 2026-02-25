from __future__ import annotations

import tempfile
from pathlib import Path
import unittest

import numpy as np

from demo_vector_cache import VectorQaStore, demo_payload


class VectorQaStoreTest(unittest.TestCase):
    def test_topk_and_tts_isolation(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "demo_vector_1.db"
            store = VectorQaStore(str(db_path))
            try:
                id_a = store.add_pair(
                    question_text="what is stent",
                    answer_text="stent intro",
                    audio_path="/audio/a.wav",
                    tts_provider="edge",
                    tts_voice="zh-CN-XiaoxiaoNeural",
                    tts_speed=1.0,
                    embedding=np.array([1.0, 0.0], dtype=np.float32),
                )
                store.add_pair(
                    question_text="what is balloon",
                    answer_text="balloon intro",
                    audio_path="/audio/b.wav",
                    tts_provider="edge",
                    tts_voice="zh-CN-XiaoxiaoNeural",
                    tts_speed=1.2,
                    embedding=np.array([1.0, 0.0], dtype=np.float32),
                )
                store.add_pair(
                    question_text="how to register",
                    answer_text="register intro",
                    audio_path="/audio/c.wav",
                    tts_provider="modelscope",
                    tts_voice="voice-x",
                    tts_speed=1.0,
                    embedding=np.array([1.0, 0.0], dtype=np.float32),
                )

                hits = store.search_topk(
                    query_embedding=np.array([1.0, 0.0], dtype=np.float32),
                    tts_provider="edge",
                    tts_voice="zh-CN-XiaoxiaoNeural",
                    tts_speed=1.0,
                    k=3,
                )
                self.assertEqual(1, len(hits))
                self.assertEqual(id_a, hits[0].pair_id)
                self.assertGreater(hits[0].score, 0.99)
            finally:
                store.close()

    def test_cosine_order(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "demo_vector_2.db"
            store = VectorQaStore(str(db_path))
            try:
                near_id = store.add_pair(
                    question_text="q-near",
                    answer_text="a-near",
                    audio_path="/audio/near.wav",
                    tts_provider="edge",
                    tts_voice="v1",
                    tts_speed=1.0,
                    embedding=np.array([0.99, 0.1], dtype=np.float32),
                )
                far_id = store.add_pair(
                    question_text="q-far",
                    answer_text="a-far",
                    audio_path="/audio/far.wav",
                    tts_provider="edge",
                    tts_voice="v1",
                    tts_speed=1.0,
                    embedding=np.array([0.0, 1.0], dtype=np.float32),
                )

                hits = store.search_topk(
                    query_embedding=np.array([1.0, 0.0], dtype=np.float32),
                    tts_provider="edge",
                    tts_voice="v1",
                    tts_speed=1.0,
                    k=2,
                )
                self.assertEqual(2, len(hits))
                self.assertEqual(near_id, hits[0].pair_id)
                self.assertEqual(far_id, hits[1].pair_id)

                payload = demo_payload(hits[0])
                self.assertTrue(payload["audio_hit"])
                self.assertIn("audio_url", payload)
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
