"""
ESP32-C3 Pin Configuration Rules Engine
Validates pin assignments and detects conflicts.
"""

# ESP32-C3 GPIO Pin Definitions
ESP32_C3_PINS = {
    0:  {"name": "GPIO0",  "caps": ["GPIO", "ADC1_CH0"], "strapping": False, "jtag": False, "usb": False, "notes": "ADC1 Channel 0"},
    1:  {"name": "GPIO1",  "caps": ["GPIO", "ADC1_CH1"], "strapping": False, "jtag": False, "usb": False, "notes": "ADC1 Channel 1"},
    2:  {"name": "GPIO2",  "caps": ["GPIO", "ADC1_CH2", "FSPIQ"], "strapping": True, "jtag": False, "usb": False, "notes": "Strapping pin (boot mode)"},
    3:  {"name": "GPIO3",  "caps": ["GPIO", "ADC1_CH3"], "strapping": False, "jtag": False, "usb": False, "notes": "ADC1 Channel 3"},
    4:  {"name": "GPIO4",  "caps": ["GPIO", "ADC1_CH4", "FSPIHD", "JTAG_MTMS"], "strapping": False, "jtag": True, "usb": False, "notes": "JTAG MTMS / FSPIHD"},
    5:  {"name": "GPIO5",  "caps": ["GPIO", "ADC2_CH0", "FSPIWP", "JTAG_MTDI"], "strapping": False, "jtag": True, "usb": False, "notes": "JTAG MTDI / FSPIWP"},
    6:  {"name": "GPIO6",  "caps": ["GPIO", "FSPICLK", "JTAG_MTCK"], "strapping": False, "jtag": True, "usb": False, "notes": "JTAG MTCK / FSPICLK"},
    7:  {"name": "GPIO7",  "caps": ["GPIO", "FSPID", "JTAG_MTDO"], "strapping": False, "jtag": True, "usb": False, "notes": "JTAG MTDO / FSPID"},
    8:  {"name": "GPIO8",  "caps": ["GPIO"], "strapping": True, "jtag": False, "usb": False, "notes": "Strapping pin (flash mode)"},
    9:  {"name": "GPIO9",  "caps": ["GPIO"], "strapping": True, "jtag": False, "usb": False, "notes": "Strapping pin (boot button)"},
    10: {"name": "GPIO10", "caps": ["GPIO", "FSPICS0"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI Flash CS"},
    11: {"name": "GPIO11", "caps": ["GPIO", "VDD_SPI"], "strapping": False, "jtag": False, "usb": False, "notes": "Flash VDD - typically reserved"},
    12: {"name": "GPIO12", "caps": ["GPIO", "SPIHD"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus HD"},
    13: {"name": "GPIO13", "caps": ["GPIO", "SPIWP"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus WP"},
    14: {"name": "GPIO14", "caps": ["GPIO", "SPICS0"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus CS0"},
    15: {"name": "GPIO15", "caps": ["GPIO", "SPICLK"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus CLK"},
    16: {"name": "GPIO16", "caps": ["GPIO", "SPID"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus D"},
    17: {"name": "GPIO17", "caps": ["GPIO", "SPIQ"], "strapping": False, "jtag": False, "usb": False, "notes": "SPI bus Q"},
    18: {"name": "GPIO18", "caps": ["GPIO", "USB_DM"], "strapping": False, "jtag": False, "usb": True, "notes": "USB D- (native USB)"},
    19: {"name": "GPIO19", "caps": ["GPIO", "USB_DP"], "strapping": False, "jtag": False, "usb": True, "notes": "USB D+ (native USB)"},
    20: {"name": "GPIO20", "caps": ["GPIO", "UART0_RX"], "strapping": False, "jtag": False, "usb": False, "notes": "Default UART0 RX"},
    21: {"name": "GPIO21", "caps": ["GPIO", "UART0_TX"], "strapping": False, "jtag": False, "usb": False, "notes": "Default UART0 TX"},
}

# Available pin functions user can assign
PIN_FUNCTIONS = {
    "UNASSIGNED": {"label": "Unassigned", "color": "muted"},
    "GPIO_INPUT": {"label": "Digital Input", "color": "primary", "applicable": list(range(22))},
    "GPIO_OUTPUT": {"label": "Digital Output", "color": "primary", "applicable": list(range(22))},
    "ADC": {"label": "ADC (Analog Input)", "color": "warning", "applicable": [0, 1, 2, 3, 4, 5]},
    "PWM": {"label": "PWM Output", "color": "primary", "applicable": list(range(22))},
    "I2C_SDA": {"label": "I2C SDA", "color": "success", "applicable": list(range(22))},
    "I2C_SCL": {"label": "I2C SCL", "color": "success", "applicable": list(range(22))},
    "SPI_MOSI": {"label": "SPI MOSI", "color": "info", "applicable": list(range(22))},
    "SPI_MISO": {"label": "SPI MISO", "color": "info", "applicable": list(range(22))},
    "SPI_SCK": {"label": "SPI SCK", "color": "info", "applicable": list(range(22))},
    "SPI_CS": {"label": "SPI CS", "color": "info", "applicable": list(range(22))},
    "UART_TX": {"label": "UART TX", "color": "accent", "applicable": list(range(22))},
    "UART_RX": {"label": "UART RX", "color": "accent", "applicable": list(range(22))},
    "I2S_BCLK": {"label": "I2S BCLK", "color": "primary", "applicable": list(range(22))},
    "I2S_WS": {"label": "I2S WS", "color": "primary", "applicable": list(range(22))},
    "I2S_DATA": {"label": "I2S DATA", "color": "primary", "applicable": list(range(22))},
}

# Reserved pins that should show warnings
RESERVED_PINS = {
    11: "GPIO11 is typically connected to flash VDD. Using it may cause flash issues.",
    12: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
    13: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
    14: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
    15: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
    16: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
    17: "GPIO12-17 may be used by internal SPI flash (PSRAM). Check your module's datasheet.",
}

# Peripheral pairing rules (functions that must be assigned together)
PERIPHERAL_GROUPS = {
    "I2C": {"required": ["I2C_SDA", "I2C_SCL"], "max_instances": 2},
    "SPI": {"required": ["SPI_MOSI", "SPI_MISO", "SPI_SCK"], "optional": ["SPI_CS"], "max_instances": 1},
    "UART": {"required": ["UART_TX", "UART_RX"], "max_instances": 2},
    "I2S": {"required": ["I2S_BCLK", "I2S_WS", "I2S_DATA"], "max_instances": 1},
}


def validate_pin_config(pin_assignments: dict) -> dict:
    """
    Validate a pin configuration for ESP32-C3.
    pin_assignments: {pin_number_str: function_name}
    Returns: {"valid": bool, "errors": [], "warnings": []}
    """
    errors = []
    warnings = []

    for pin_str, func in pin_assignments.items():
        pin_num = int(pin_str)

        # Check pin exists
        if pin_num not in ESP32_C3_PINS:
            errors.append(f"GPIO{pin_num} does not exist on ESP32-C3")
            continue

        if func == "UNASSIGNED":
            continue

        # Check function exists
        if func not in PIN_FUNCTIONS:
            errors.append(f"Unknown function '{func}' for GPIO{pin_num}")
            continue

        # Check if pin supports the function
        applicable = PIN_FUNCTIONS[func].get("applicable", [])
        if applicable and pin_num not in applicable:
            errors.append(f"GPIO{pin_num} does not support {PIN_FUNCTIONS[func]['label']}")

        # Check strapping pin warning
        pin_info = ESP32_C3_PINS[pin_num]
        if pin_info["strapping"]:
            warnings.append(f"GPIO{pin_num} is a strapping pin. External circuitry may affect boot if this pin is driven during reset.")

        # Check JTAG pin warning
        if pin_info["jtag"]:
            warnings.append(f"GPIO{pin_num} is a JTAG pin. Assigning it will disable JTAG debugging on this pin.")

        # Check USB pin warning
        if pin_info["usb"]:
            warnings.append(f"GPIO{pin_num} is a USB pin. Assigning it will disable native USB functionality.")

        # Check reserved pin warning
        if pin_num in RESERVED_PINS:
            warnings.append(RESERVED_PINS[pin_num])

    # Check for duplicate function assignments (some functions should be unique)
    func_pins = {}
    for pin_str, func in pin_assignments.items():
        if func != "UNASSIGNED":
            if func not in func_pins:
                func_pins[func] = []
            func_pins[func].append(int(pin_str))

    # Check ADC conflicts (ADC1 and ADC2 share the SAR ADC)
    adc_pins = func_pins.get("ADC", [])
    if len(adc_pins) > 6:
        errors.append("ESP32-C3 has only 6 ADC channels (GPIO0-5)")

    # Check peripheral group completeness
    for group_name, group_rules in PERIPHERAL_GROUPS.items():
        assigned = {f: func_pins.get(f, []) for f in group_rules["required"]}
        has_any = any(len(v) > 0 for v in assigned.values())
        has_all = all(len(v) > 0 for v in assigned.values())

        if has_any and not has_all:
            missing = [f for f, v in assigned.items() if len(v) == 0]
            warnings.append(f"{group_name} peripheral is incomplete. Missing: {', '.join(missing)}")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def get_board_profile():
    """Return the full ESP32-C3 board profile for the frontend."""
    pins = []
    for num, info in ESP32_C3_PINS.items():
        applicable_functions = ["UNASSIGNED"]
        for func_name, func_info in PIN_FUNCTIONS.items():
            if func_name == "UNASSIGNED":
                continue
            applicable = func_info.get("applicable", [])
            if not applicable or num in applicable:
                applicable_functions.append(func_name)
        pins.append({
            "number": num,
            "name": info["name"],
            "capabilities": info["caps"],
            "strapping": info["strapping"],
            "jtag": info["jtag"],
            "usb": info["usb"],
            "notes": info["notes"],
            "available_functions": applicable_functions,
        })
    return {
        "board": "ESP32-C3",
        "total_gpio": 22,
        "pins": pins,
        "functions": {k: {"label": v["label"], "color": v["color"]} for k, v in PIN_FUNCTIONS.items()},
        "peripheral_groups": PERIPHERAL_GROUPS,
    }
