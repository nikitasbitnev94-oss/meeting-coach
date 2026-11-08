# Модель голоса

`voice-campplus-int8.onnx` — модель CAM++ (3D-Speaker, обучена на VoxCeleb, лицензия Apache-2.0):
https://www.modelscope.cn/models/iic/speech_campplus_sv_en_voxceleb_16k
ONNX-версия из sherpa-onnx (`3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`), веса сжаты в int8
(`onnxruntime.quantization.quantize_dynamic`, QUInt8): 29 → 9 МБ, скорость та же, отпечатки совпадают с исходной моделью в среднем на 0,97 по косинусу.
