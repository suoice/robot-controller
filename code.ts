let device, characteristic;
let secondaryCharacteristic;
let commandByte = 0b00000000;

// BLE UUIDs
const SERVICE_UUID =         "29dbb6d8-ed86-4e9f-a3ad-755f0696bf97";
const CHARACTERISTIC_UUID =  "c316d3c1-e971-4733-8152-0794204b2300";
const CHARACTERISTIC_UUID2 = "b23456de-5678-1234-5678-abcdefabcdef";

const LED_FLAGS = {
    led1: 0x01, led2: 0x02, led3: 0x04, led4: 0x08,
    led5: 0x10, led6: 0x20, led7: 0x40, led8: 0x80
};

const keyMap = {
    KeyQ: LED_FLAGS.led1, KeyW: LED_FLAGS.led2,
    KeyE: LED_FLAGS.led3, KeyR: LED_FLAGS.led4,
    KeyA: LED_FLAGS.led5, KeyS: LED_FLAGS.led6,
    KeyD: LED_FLAGS.led7, KeyF: LED_FLAGS.led8
};

const MUTUALLY_EXCLUSIVE_PAIRS = [
    [LED_FLAGS.led1, LED_FLAGS.led2],
    [LED_FLAGS.led3, LED_FLAGS.led4],
    [LED_FLAGS.led5, LED_FLAGS.led6],
    [LED_FLAGS.led7, LED_FLAGS.led8]
];

const bitToId = {};
for (const id in LED_FLAGS) {
    bitToId[LED_FLAGS[id]] = id;
}

document.getElementById("connect").addEventListener("click", async () => {
    if (!navigator.bluetooth) {
        alert("Web Bluetooth not supported on this browser.");
        return;
    }

    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: "ESP32_Byte" }],
            optionalServices: [SERVICE_UUID]
        });

        device.addEventListener("gattserverdisconnected", onDisconnected);
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        secondaryCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID2);

        console.log("Connected to ESP32!");
        alert("Connected to ESP32!");

        // Enable all buttons
        [
            "led1", "led2", "led3", "led4",
            "led5", "led6", "led7", "led8",
            "modeToggle", "clawRest", "clawRaise", "clawLower",
            "camToggle", "camStream", "track"
        ].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });

        // Register toggle button handlers
        document.getElementById("modeToggle").addEventListener("click", () => sendSingleCommand(0x01));
        document.getElementById("clawRest").addEventListener("click", () => sendSingleCommand(0x02));
        document.getElementById("clawRaise").addEventListener("click", () => sendSingleCommand(0x04));
        document.getElementById("clawLower").addEventListener("click", () => sendSingleCommand(0x08));
        document.getElementById("camToggle").addEventListener("click", () => sendSingleCommand(0x10));
        document.getElementById("track").addEventListener("click", () => sendSingleCommand(0x40));
        document.getElementById("status").classList.add("connected");
        document.getElementById("status").textContent = "Connected";

    } catch (err) {
        console.error("Connection failed:", err);
        alert("BLE connection failed. See console for details.");
    }
});

// Streaming Function
const camURL = "http://192.168.5.80:8080/stream";

function loadStream() {
  const camImg = document.getElementById("cam");
  camImg.src = camURL + "?t=" + Date.now();
}

async function sendCommand() {
    if (characteristic) {
        try {
            await characteristic.writeValue(Uint8Array.of(commandByte));
            console.log(`Sent: 0b${commandByte.toString(2).padStart(8, "0")}`);
        } catch (err) {
            console.error("Error sending:", err);
        }
    }
}

async function sendSingleCommand(byteValue) {
    if (secondaryCharacteristic) {
        try {
            await secondaryCharacteristic.writeValue(Uint8Array.of(byteValue));
            console.log(`Sent toggle: 0x${byteValue.toString(16).padStart(2, '0')}`);
        } catch (err) {
            console.error("Toggle send failed:", err);
        }
    }
}

function applyExclusiveBit(newBit) {
    for (const pair of MUTUALLY_EXCLUSIVE_PAIRS) {
        if (pair.includes(newBit)) {
            const oppositeBit = (pair[0] === newBit) ? pair[1] : pair[0];
            if (commandByte & oppositeBit) {
                commandByte &= ~oppositeBit;
                const oppositeId = bitToId[oppositeBit];
                if (oppositeId) {
                    document.getElementById(oppositeId).classList.remove("active");
                }
            }
            break;
        }
    }
    commandByte |= newBit;
}

function registerInputEvents(id, bit) {
    const btn = document.getElementById(id);

    const press = async () => {
        applyExclusiveBit(bit);
        btn.classList.add("active");
        await sendCommand();
    };

    const release = async () => {
        if (commandByte & bit) {
            commandByte &= ~bit;
            btn.classList.remove("active");
            await sendCommand();
        }
    };

    // Mouse
    btn.addEventListener("mousedown", press);
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);

    // Touch (mobile)
    btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        press();
    }, { passive: false });

    btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        release();
    }, { passive: false });
}

Object.keys(LED_FLAGS).forEach(id => {
    registerInputEvents(id, LED_FLAGS[id]);
});

document.addEventListener('keydown', async (e) => {
    if (e.repeat || !keyMap[e.code]) return;

    const bit = keyMap[e.code];
    if (!(commandByte & bit)) {
        applyExclusiveBit(bit);
        updateButtonUI(e.code, true);
        await sendCommand();
    }
});

document.addEventListener('keyup', async (e) => {
    if (!keyMap[e.code]) return;

    const bit = keyMap[e.code];
    if (commandByte & bit) {
        commandByte &= ~bit;
        updateButtonUI(e.code, false);
        await sendCommand();
    }
});

function updateButtonUI(code, isPressed) {
    const keyToId = {
        KeyW: 'led1', KeyS: 'led2', KeyA: 'led3', KeyD: 'led4',
        KeyU: 'led5', KeyI: 'led6', KeyJ: 'led7', KeyK: 'led8'
    };
    const btn = document.getElementById(keyToId[code]);
    if (btn) btn.classList.toggle("active", isPressed);
}

function onDisconnected(event) {
    const name = event.target?.name || "device";
    console.log(`Disconnected from ${name}`);
    alert(`Disconnected from ${name}`);

    [
        "led1", "led2", "led3", "led4",
        "led5", "led6", "led7", "led8",
        "modeToggle", "clawRest", "clawRaise", "clawLower",
        "camToggle", "camStream", "track"
    ].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = true;
            btn.classList.remove("active");
        }
    });

    commandByte = 0;

    document.getElementById("status").classList.remove("connected");
    document.getElementById("status").textContent = "Disconnected";
}
