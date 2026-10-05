# Запуск Paganini на Android-проекторе с внешним микрофоном

Исследование: как запустить [Paganini Ukulele](https://krivich.github.io/paganini/)
на Android-проекторе **Wanbo T2 Ultra** и получить рабочий микрофонный вход
(`getUserMedia`). Дата: 2026-10-04.

## TL;DR

* Игра **работает** на проекторе в браузере DuckDuckGo: страница грузится,
  `getUserMedia` получает поток, внизу видно `Detected Frequency: <N> Hz`.
* **Встроенные микрофоны проектора не работают** (см. таблицу ниже) — нужен
  **внешний USB-микрофон** (проверено) или, возможно, BT-гарнитура (не проверено).
* Проектор, в отличие от ТВ Philips, поддерживает **USB-аудио** и **BT SCO** —
  поэтому USB-микрофон подхватывается «из коробки», без рута и правок прошивки.

## Устройство

| Параметр | Значение |
|---|---|
| Модель | Wanbo T2 Ultra / Skyworth TV Stick (`ro.product.brand=Skyworth`) |
| Android | 11 |
| ABI | `armeabi-v7a` |
| Экран | 1280×720 |
| RAM | ~1 ГБ (слабая: старт страницы 30–45 с) |
| ADB | `192.168.0.199:5555` |
| USB-хост | есть (`android.hardware.usb.host`) |

`pm list features` не содержит `android.hardware.microphone` — формально это
не «микрофонное» устройство, но запись через AudioRecord/WebView всё равно
работает.

## Как воспроизвести

1. Вставить USB-микрофон в порт проектора.
2. Подключиться и выдать разрешение:
   ```
   adb connect 192.168.0.199:5555
   adb -s 192.168.0.199:5555 shell pm grant com.duckduckgo.mobile.android android.permission.RECORD_AUDIO
   ```
3. Открыть игру в браузере DuckDuckGo:
   ```
   adb -s 192.168.0.199:5555 shell am start -a android.intent.action.VIEW -d "https://krivich.github.io/paganini/" com.duckduckgo.mobile.android
   ```
4. Подождать ~40 с (первые 20–40 с — белый экран, это норма для слабого CPU).
5. Разбудить экран, если проектор ушёл в сон/скринсейвер:
   ```
   adb -s 192.168.0.199:5555 shell input keyevent 224
   ```
6. Играть. Внизу экрана — `Detected Frequency` и статус калибровки
   (`lowFret1` → `completed` → `highFret1`).

Перезапуск страницы: `am force-stop` пакета + повторный `am start` из п.3.

## Микрофоны: результат замера

Перечисление входов `AudioManager.getDevices(GET_DEVICES_INPUTS)` и запись
по ~2 с с каждого (утилита `com.micprobe`, см. ниже):

| id | type | имя | addr | макс / средн. | вывод |
|----|------|-----|------|---------------|-------|
| 9  | 17 (Tuner) | TV Stick | — | не открывается | — |
| 14 | 15 (BUILTIN_MIC) | TV Stick | `top` | `0 / 0` | тишина (нули) |
| 10 | 15 (BUILTIN_MIC) | TV Stick | `back` | `32766 / 2796` | **фиксированный шаблон**, не меняется от звука |
| 12 | 26 (BACK_MIC) | TV Stick | — | не открывается (−4) | — |
| 16 | 25 | TV Stick | `0` | не открывается | — |
| 113 | 11 (USB_DEVICE) | USB-Audio - USB PnP Sound Device | `card=1;device=0;` | меняется от звука | **рабочий** |

Пояснение: `top` и `back` — оба `BUILTIN_MIC`. `top` всегда отдаёт нули,
`back` — постоянные `max=32766, avg=2796` и в тишине, и под громким тоном
440 Гц (значения бит-в-бит одинаковые). То есть это не живой звук, а
заглушка/паттерн HAL. Вывод: встроенные микрофоны использовать нельзя.

USB-микрофон (C-Media Electronics, «USB PnP Sound Device», `08bb:2902`)
регистрируется как `AUDIO_DEVICE_IN_USB_DEVICE`, и Android **сам направляет
захват на него**: в `dumpsys media.audio_flinger` активный record-поток идёт с
`Input device: 0x80001000 (AUDIO_DEVICE_IN_USB_DEVICE)`. Игра при этом видит
реальную частоту.

В политике Wanbo также заявлены входы **USB Device In / USB Headset In /
BT SCO Headset / A2DP In** — значит с высокой вероятностью подойдёт и
BT-гарнитура (в этой сессии не проверялось).

## Браузер

* Пакет: `com.duckduckgo.mobile.android` (v5.295.3).
* Вебвью: `com.google.android.webview` 153.0.8010.36.
* Open-URL снаружи обрабатывает `com.duckduckgo.app.dispatchers.IntentDispatcherActivity`
  (http/https), окно — `com.duckduckgo.app.browser.BrowserActivity`.
* Декларирует `RECORD_AUDIO`; по умолчанию выдача `granted=false`, поэтому нужно
  выдать через `pm grant` (см. выше).

## Грабля/мелочи

* Первые ~20–40 с после открытия URL — **белый экран**, не пугаться; позже
  рисуется интерфейс `Paganini - Instruments`.
* Проектор уходит в скринсейвер `com.google.android.backdrop`
  (`android.service.dreams.DreamActivity`) — будить `input keyevent 224`.
* Калибровка проходит стадии: `lowFret1` (низкая нота) → `completed`, затем
  `highFret1` (12-й лад). Поле `Detected Frequency` показывает текущую пойманную
  частоту в Гц; `Expected Frequency` подставляется после выбора песни.
* Проверить, что запись реально идёт с USB:
  ```
  adb -s 192.168.0.199:5555 shell "dumpsys media.audio_flinger | grep -E 'AudioIn_|Input device'"
  ```

## Утилита замера (`com.micprobe`)

Небольшой APK: перечисляет входы, по каждому делает `setPreferredDevice` и пишет
2 с через `AudioRecord` (48 кГц, моно, PCM-16), логирует `max/avg/samples/routed`
в logcat с тегом `MICPROBE`. Ключевой фрагмент:

```java
for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
    AudioRecord r = new AudioRecord(MediaRecorder.AudioSource.MIC, 48000,
        AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, 4800 * 4);
    r.setPreferredDevice(d);
    r.startRecording();
    short[] buf = new short[4800];
    int max = 0; long sum = 0; int n = 0;
    for (int sec = 0; sec < 2; sec++) {
        int c = r.read(buf, 0, buf.length);
        for (int i = 0; i < c; i++) {
            int v = Math.abs(buf[i]);
            if (v > max) max = v;
            sum += v; n++;
        }
    }
    AudioDeviceInfo routed = r.getRoutedDevice();
    Log.i("MICPROBE", "id=" + d.getId() + " type=" + d.getType()
        + " max=" + max + " avg=" + (n > 0 ? sum / n : -1)
        + " samples=" + n + " routed="
        + (routed != null ? routed.getId() + "/type" + routed.getType() : "null"));
    r.stop(); r.release();
}
```

## Почему проектор, а не ТВ Philips

Изначальная цель — ТВ Philips `192.168.0.187` (Android TV). Там USB-микрофон
**не поднимается**: в прошивке (`UsbHostManager.smali`) есть OEM-блок Philips/TPV —
если у USB-устройства есть аудио-интерфейс, оно добавляется **только** при
`vid=0x0471 / pid=0x6602` (их «фирменная» гарнитура) либо когда во главе стека
запущен CTS (`com.android.cts.verifier`). Любой другой USB-микрофон молча
игнорируется. Плюс на ТВ нет hotplug, нет root и нет BT HFP.

Поэтому выбрали проектор: там такого блока нет, USB-аудио и BT работают штатно,
и игра стартует.
