# August / Yale — guía de uso

Esta integración lleva sus **cerraduras inteligentes** y **videoporteros**
**August** y **Yale** a Gladys Assistant, a través de la nube August / Yale — la
misma que usan las apps oficiales.

## Qué obtiene

| Dispositivo           | En Gladys                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Cerradura inteligente | Bloquear / desbloquear, batería, puerta abierta / cerrada (DoorSense), batería del teclado |
| Videoportero          | Última imagen (cámara), timbre, movimiento, batería                                        |

Además de los dispositivos:

- **Disparadores de escena**: _Cerradura accionada_ (filtro por cerradura,
  acción — bloqueada, desbloqueada, abierta — y modo: app, a distancia,
  teclado, a mano, bloqueo automático, huella, llavero; el nombre del usuario
  está disponible como variable), _Cerradura atascada_, _Timbre pulsado_,
  _Movimiento ante el timbre_.
- **Acciones de escena**: _Bloquear una puerta_, _Desbloquear una puerta_,
  _Abrir una puerta (retraer el pestillo)_, _Capturar una imagen del timbre_.
  Cada una indica si ha tenido éxito, para condicionar las acciones
  siguientes.
- **Widgets del panel**: _Cerradura_ (una cerradura con sus botones, o un
  resumen de todas las cerraduras con un botón «Bloquear todo»),
  _Videoportero_ (última imagen, último timbrazo y último movimiento),
  _Actividad de puertas_ (quién hizo qué, cómo y cuándo).

Modelos compatibles: todas las cerraduras y timbres gestionados por las apps
August, Yale Access y Yale Home — August Smart Lock (todas las generaciones),
August Wi-Fi Smart Lock, Yale Linus, Yale Linus L2, Yale Assure Lock / Assure
Lock 2, Yale Conexis L2, Yale Unity, August View, Yale Smart Video Doorbell…

## Requisitos

- Gladys Assistant **5.1 o posterior**.
- Una cuenta en la app **August**, **Yale Access** o **Yale Home**, con sus
  dispositivos ya instalados.
- Para ver el estado en directo y controlar una cerradura desde Gladys, la
  cerradura debe ser accesible desde la nube: un **puente Wi-Fi** (August
  Connect, Yale Connect Wi-Fi Bridge) o una cerradura con Wi-Fi integrado. Sin
  puente, la cerradura aparece con un punto naranja: su estado solo se
  actualiza cuando un teléfono con la app la encuentra por Bluetooth.

La integración funciona **solo a través de la nube**: el contenedor de Gladys
no tiene acceso al Bluetooth, por lo que el control local no está disponible.

## Configuración

1. Abra **Integraciones → August / Yale → Configuración**.
2. Elija la **app** en la que están registradas sus cerraduras:
   - _August_ — la app August;
   - _Yale Access_ — la app Yale Access (Norteamérica);
   - _Yale Home_ — la app Yale Home (Europa y resto del mundo).
3. Elija el **método de inicio de sesión** (correo o número de teléfono),
   introduzca el **usuario** y la **contraseña** de su cuenta y guarde.
4. La primera vez, la nube envía un **código de verificación** por correo o
   SMS. Introdúzcalo en la acción **Validar el código** de la pantalla de
   configuración. ¿No lo ha recibido? Use **Enviar un código nuevo**.
5. Abra la pestaña **Descubrimiento**: sus cerraduras y timbres aparecen en la
   lista. Créelos.

El código solo se pide una vez: la sesión se conserva en el almacenamiento de
la integración. Cambiar de cuenta o de app pide un código nuevo.

## Opciones

- **Eventos en tiempo real** (activado por defecto): los eventos (cerradura
  accionada, timbre pulsado…) llegan en pocos segundos por el canal que usan
  las apps. Desactivado, la actividad se lee cada minuto.
- **Permitir el desbloqueo desde Gladys** (activado por defecto): desactívelo
  para garantizar que Gladys puede bloquear pero nunca desbloquear ni abrir
  una puerta — los widgets solo muestran entonces el botón «Bloquear» y las
  acciones de escena de desbloqueo se rechazan.
- **Intervalo de actualización**: frecuencia de relectura de todos los
  dispositivos (5 minutos por defecto, 1 minuto como mínimo).

## Valores

- Cerradura: `1` = bloqueada, `0` = desbloqueada (un pestillo retraído vale `0`).
- Puerta: `1` = cerrada, `0` = abierta.
- Timbre y movimiento: `1` durante unos segundos y después `0`.

## Solución de problemas

- **«Inicio de sesión rechazado»**: compruebe la app (August / Yale Access /
  Yale Home), el método de inicio de sesión y la contraseña. Inicie sesión en
  la app con los mismos datos para asegurarse.
- **No llega el código**: revise la carpeta de spam y use **Enviar un código
  nuevo**. Un número de teléfono debe estar en formato internacional
  (p. ej. `+34612345678`).
- **Una cerradura aparece inaccesible**: su puente Wi-Fi está desconectado.
  Compruebe su alimentación y su Wi-Fi.
- **Cuentas Yale Home**: Yale está migrando las cuentas Yale Home a un nuevo
  sistema de inicio de sesión. Si el inicio de sesión se rechaza aunque los
  datos funcionen en la app, abra una issue en el repositorio.
- Use **Probar la conexión** para volver a leer la cuenta y ver cuántas
  cerraduras y timbres se han encontrado. Los registros de la integración
  (Gladys → Ajustes → Sistema → Integraciones) dan más detalles; nunca
  contienen su contraseña ni su token.

## Privacidad y seguridad

La contraseña permanece en la configuración de Gladys; el token de sesión se
guarda en el volumen privado de la integración. Solo se contacta con la nube
August / Yale, su servicio en tiempo real (PubNub) y el alojamiento de las
imágenes de los timbres (Cloudinary). Comunique cualquier problema de
seguridad en privado, consulte `SECURITY.md` en el repositorio.
