# Análisis Comparativo de sensores IoT

controladores a evaluar por compatibilidad:  
SP-32 S3 Touch-AMOLED \- 1.75C  
M5-Watch StickC-Plus2 m5  
SeedStudio Model xiao SP-32 C6  
SP32 \- S3-PICO-1-N8R8

**Tabla Comparativa de Controladores Evaluados**

| Controlador | Costo Estimado | Capacidad de Procesamiento y Memoria | Eficiencia Eléctrica / Batería | Facilidad de Implementación | Conectividad y Protocolos |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **ESP32-S3 Touch-AMOLED 1.75C** *(Waveshare)* | \~$34 USD | **Alta:** Dual-core LX7 a 240MHz. 8MB PSRAM, 8MB Flash. | **Media-Baja:** La pantalla AMOLED de 1.75" y los micrófonos duales aumentan el consumo. Incluye gestión de carga LiPo (3.7V). | **Media:** Excelente para UI, incluye sensores de movimiento (IMU) y RTC integrados. Sin embargo, su tamaño y falta de carcasa dificultan usarlo como wearable inmediato. | Wi-Fi 2.4GHz, Bluetooth 5 (LE). |
| **M5StickC PLUS2** *(M5Stack \- Watch)* | \~$23 USD | **Media-Alta:** ESP32-PICO-V3-02 Dual-Core a 240MHz. 2MB PSRAM, 8MB Flash. | **Media:** Consumo moderado. Integra una batería pequeña de 200mAh interna, lo que limita su autonomía a unas pocas horas en uso continuo. | **Muy Alta:** Viene con carcasa, correa de reloj, pantalla TFT, acelerómetro/giroscopio (IMU) y puerto Grove (I2C) para conectar sensores externos fácilmente. | Wi-Fi 2.4GHz, Bluetooth. |
| **XIAO ESP32-C6** *(Seeed Studio)* | \~$5 – $7 USD | **Media:** Single-core RISC-V a 160MHz \+ núcleo de bajo consumo a 20MHz. 512KB SRAM, 4MB Flash. | **Ultra Alta:** Consumo de solo 15 µA en modo *Deep Sleep*. Ideal para muestreo adaptativo de sensores. Gestión de batería integrada. | **Media-Baja:** Formato miniatura (21 x 17.5 mm). Requiere soldar pines, diseñar una carcasa y conectar los biosensores por hardware, pero es perfecto para nodos invisibles. | Wi-Fi 6 (802.11ax), Bluetooth 5.0 (LE), Zigbee, Thread. |
| **ESP32-S3-PICO-1-N8R8** *(Módulo Base/Tiny)* | \~$7 – $10 USD | **Alta:** Dual-core LX7 a 240MHz. 8MB PSRAM, 8MB Flash. | **Alta:** Excelente manejo de energía típico de la familia S3, pero depende del diseño del circuito externo que se le añada. | **Baja:** Es una placa de desarrollo base. Requiere integrar físicamente la batería, el control de carga y todos los módulos de sensores desde cero. | Wi-Fi 2.4GHz, Bluetooth 5 (LE). |

**Decisión:**  
Se decide utilizar el controlador M5StickC PLUS2 (M5Stack \- Watch), porque viene ensamblado y permite prototipar la captura de ruido al instante, cumpliendo la regla de no gastar tiempo armando hardware complejo.

**Tabla comparativa de sensores**

| Variable Física | Sensor Típico / Módulo | Costo Estimado (Módulo/IC) | Precisión | Eficiencia Eléctrica (Consumo) | Facilidad de Implementación |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Frecuencia Cardiaca / PPG (HR/HRV)** | MAX30102 / MAX86161 (Óptico) | Bajo a Medio ($3 – $8 USD) | Media-Alta (Sensible a artefactos de movimiento) | Muy Alta (\~0.6 – 1.2 mA en activo, sleep \< 1µA) | **Media:** Requiere algoritmos de filtrado digital para corregir movimiento. |
| **Actividad Electrocutánea (EDA / GSR)** | Grove GSR / Circuitos basados en AD5940 / MAX30001 | Medio ($8 – $20 USD) | Alta para *arousal* autonómico | Alta (\< 1 mA) | **Baja-Media:** Requiere contacto directo con piel (electrodos secos en muñeca o dedos); puede generar rechazo táctil. |
| **Movimiento / Actigrafía (IMU 6-Ejes)** | MPU-6050 / LSM6DSOX / BMI270 | Muy Bajo ($1.5 – $4 USD) | Muy Alta (Detección de patrones y micro-movimientos) | Ultra Alta (\< 0.5 mA, con auto-wake up) | **Alta:** Comunicación estándar I2C/SPI, bajo procesamiento base, sin fricción cutánea. |
| **Temperatura Cutánea** | TMP117 / MLX90614 (IR) / MAX30205 | Muy Bajo a Bajo ($2 – $6 USD) | Ultra Alta (±0.1°C de grado clínico) | Ultra Alta (\< 150µA) | **Alta:** Fácil integración por I2C; requiere buen acople térmico con la carcasa. |
| **Ruido Ambiental ($dB\_{SPL}$)** | INMP441 / ICS-43434 (MEMS I2S) | Muy Bajo ($1.5 – $3 USD) | Alta (Calibrable según ponderación dBA) | Alta (\~1 – 2 mA) | **Media:** Requiere cálculo de RMS o decibeles en microcontrolador (sin almacenar audio crudo por privacidad). |
| **Luz Ambiental / Flicker** | BH1750 / VEML7700 / TSL2591 | Muy Bajo ($1 – $3 USD) | Alta (Respuesta espectral similar al ojo humano) | Ultra Alta (\< 200µA) | **Alta:** Protocolo simple I2C, lectura directa en formato digital. |

**Tabla comparativa de compatibilidad con sensores y controlador**

| Sensor / Variable | Prioridad (NeuraDash) | Justificación en el Proyecto | Compatibilidad M5StickC Plus 2 |
| :---- | :---- | :---- | :---- |
| **Ruido ambiental** | 1 | Es el sensor ambiental que cuenta con mayor justificación dentro de los propios datos de BLUBA. | **Nativa.** El dispositivo posee un micrófono integrado (SPM1423) perfecto para simular o capturar picos de decibelios en el ambiente. |
| **Movimiento (IMU)** | 2 | Puede medir la desviación del patrón motor habitual del niño. | **Nativa.** Cuenta con una IMU de 6 ejes integrada (MPU6886) que entrega telemetría directa de acelerómetro y giroscopio. |
| **Luz** | 3 | Considerada secundaria, ya que la medición en Lux no representa la totalidad de la sobrecarga visual. | **Vía Módulo Externo.** Requiere conectar un sensor de luminosidad (ej. sensor Unit de M5Stack) a través del puerto Grove (I2C o analógico). |
| **PPG / Frecuencia Cardíaca (HR)** | 4 | Aporta contexto proximal, aunque el diseño original prefiere obtenerlo de wearables existentes (capa CONNECT). | **Vía Módulo Externo.** Necesitaría un módulo sensor de pulso (Hat o Unit) acoplado para simular la lectura cardíaca. |
| **EDA (Actividad Electrodérmica)** | 5 (Fase futura) | Muestra potencial para detectar arousal autonómico, pero presenta problemas de contacto con la piel, variabilidad y posible rechazo táctil. | **Vía Módulo Externo.** Requiere un sensor GSR (Respuesta Galvánica de la Piel) externo conectado mediante Grove, junto con electrodos físicos. |

## **1\. Envío de Telemetría y Protocolos**

**Para enviar los datos desde el M5StickC Plus 2 hacia tu backend, el dispositivo empaqueta las lecturas en el payload JSON que definimos y lo transmite de forma inalámbrica.**

* **Para el MVP (Hackatón): Utiliza HTTP POST (REST). Tu backend ya está construido en FastAPI con esquemas Pydantic. Es la ruta más directa: creas un *Data Adapter* (ej. POST /api/v1/telemetry) y el M5StickC envía el JSON allí.**  
* **Para Producción (Futuro): El estándar de la industria es MQTT. Es más ligero para la batería y soporta QoS (Calidad de Servicio), garantizando que el mensaje llegue aunque la red sea inestable.**

## **2\. Provisión de Wi-Fi y Pérdida de Conexión**

* **Provisión inicial: En el MVP, simplemente escribe (hardcodea) el nombre de la red y contraseña en el código de Arduino/C++. Para el producto real, se utiliza un Portal Cautivo (el M5StickC crea una red Wi-Fi temporal a la que el cuidador se conecta con el celular para ingresar las credenciales de la casa) o provisión vía Bluetooth LE.**  
* **Si pierde conexión (Zonas ciegas): Es un escenario crítico en escuelas. El microcontrolador debe tener una cola de almacenamiento local (usando su memoria Flash o PSRAM interna). Mientras esté offline, guarda los JSON con sus source\_timestamp reales. Al detectar nuevamente el Wi-Fi, realiza un *bulk upload* (envío por lotes). Tu sistema absorberá estos datos respetando el reloj temporal del motor.**

## **3\. Herramientas Externas**

**No necesitas tecnologías externas para este MVP. De hecho, el documento de arquitectura técnica de tu proyecto prohíbe explícitamente usar *"microservicios, Kafka, Kubernetes ni infraestructura IoT como dependencia del MVP"*.**

**Para la demostración, basta con que el microcontrolador le hable directamente a FastAPI. En una etapa de escalabilidad real (Piloto), recién ahí se justificaría usar un intermediario como AWS IoT Core o un Broker MQTT (Mosquitto) para manejar miles de conexiones concurrentes.**

## **4\. Arquitectura Recomendada**

**Debes apegarte estrictamente al Monolito Modular definido en tu *Source of Truth*. Esta es la estructura que te conviene y que ya estás construyendo:**

1. **Capa SENSE (M5StickC): Actúa como un cliente simple. Captura ruido/movimiento, ensambla el JSON con la etiqueta synthetic\_flag correspondiente y lo dispara por Wi-Fi.**  
2. **Capa CORE (Tu Backend FastAPI): Recibe el dato en tu CsvJsonDataProvider a través de un endpoint. Almacena la observación de forma transparente en tus archivos locales, unificando el flujo sin importar si el dato vino de la app React o del sensor.**  
3. **Procesamiento (Temporal Engine): El motor ignora el origen físico y procesa la telemetría evaluando que el availability\_timestamp no rompa la regla de predicción.**

