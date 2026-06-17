#include <Servo.h>

Servo myServo;

const int servoPin = 10;

// L298N Motor Driver Pins
// Motor Set 1 & 2 (parallel on OUT1/OUT2)
const int enableA  = 9;     // ENA - PWM control
const int motorA1  = 8;     // IN1 - direction control
const int motorA2  = 7;     // IN2 - direction control

// Motor 3 (on OUT3/OUT4)
const int enableB  = 4;     // ENB - PWM control
const int motorB1  = 6;     // IN3 - direction control
const int motorB2  = 5;     // IN4 - direction control

// Calibration values — now adjustable live from the web page.
// (They start at your original defaults and reset on power-up/reset.)
int stopSignal    = 92;
int forwardSignal = 120;
int reverseSignal = 64;     // optional: lets you send negative lengths to back up
float msPerUnit   = 100.0;

void setup() {
  Serial.begin(9600);
  myServo.attach(servoPin);
  myServo.write(stopSignal);
  
  // Motor control pins
  pinMode(enableA, OUTPUT);
  pinMode(motorA1, OUTPUT);
  pinMode(motorA2, OUTPUT);
  pinMode(enableB, OUTPUT);
  pinMode(motorB1, OUTPUT);
  pinMode(motorB2, OUTPUT);
  
  // Initialize motors to stopped
  stopMotors();

  Serial.println("Servo and motor control ready.");
  Serial.println("Enter a length for servo, or M1<value> / M2<value> for motors:");
}

void loop() {
  if (Serial.available() > 0) {

    // Peek at the first character to decide: is this a command or a number?
    int first = Serial.peek();

    // Motor commands start with 'M'
    if (first == 'M' || first == 'm') {
      handleMotor();
    }
    // Commands start with a letter (C for CAL, S for STOP)
    else if (first == 'C' || first == 'c' || first == 'S' || first == 's') {
      handleCommand();
    } else {
      handleLength();
    }
  }
}

// ---- Move the servo for a given length ----
void handleLength() {
  float length = Serial.parseFloat();
  flushSerial();

  // Pick direction based on sign of the length
  int signal = (length >= 0) ? forwardSignal : reverseSignal;
  long runTime = (long)(fabs(length) * msPerUnit);

  Serial.print("Moving ");
  Serial.print(length);
  Serial.println(" units...");

  myServo.write(signal);
  delay(runTime);
  myServo.write(stopSignal);

  Serial.println("Done.");
  Serial.println();
  Serial.println("Enter a length:");
}

// ---- Handle text commands (CAL ..., STOP) ----
void handleCommand() {
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "STOP") {
    myServo.write(stopSignal);
    Serial.println("STOPPED.");
    return;
  }

  // Calibration: "CAL S92", "CAL F120", "CAL R64", "CAL M100"
  if (cmd.startsWith("CAL")) {
    String rest = cmd.substring(3);
    rest.trim();
    if (rest.length() < 2) { Serial.println("Bad CAL command."); return; }

    char which = rest.charAt(0);
    float value = rest.substring(1).toFloat();

    switch (which) {
      case 'S': stopSignal    = (int)value; Serial.print("stopSignal = ");    Serial.println(stopSignal);    break;
      case 'F': forwardSignal = (int)value; Serial.print("forwardSignal = "); Serial.println(forwardSignal); break;
      case 'R': reverseSignal = (int)value; Serial.print("reverseSignal = "); Serial.println(reverseSignal); break;
      case 'M': msPerUnit     = value;      Serial.print("msPerUnit = ");     Serial.println(msPerUnit);     break;
      default:  Serial.println("Unknown CAL field."); return;
    }
    // Apply the new stop signal immediately so the servo holds still
    myServo.write(stopSignal);
    return;
  }

  Serial.print("Unknown command: ");
  Serial.println(cmd);
}

// ---- Clear any leftover serial characters ----
void flushSerial() {
  while (Serial.available()) {
    Serial.read();
  }
}

// ---- Motor control (L298N) ----
// Command format: M1<value> for Motor Set 1, M2<value> for Motor Set 3
// Value range: -1.0 (full reverse) to 1.0 (full forward), 0 = stop
void handleMotor() {
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();
  flushSerial();

  if (cmd.length() < 2) {
    Serial.println("Bad motor command.");
    return;
  }

  char motorNum = cmd.charAt(1);  // '1' or '2'
  float speed = cmd.substring(2).toFloat();

  // Clamp speed to -1.0 to 1.0
  if (speed < -1.0) speed = -1.0;
  if (speed > 1.0) speed = 1.0;

  if (motorNum == '1') {
    setMotorSpeed(enableA, motorA1, motorA2, speed);
    Serial.print("Motor Set 1 speed: ");
    Serial.println(speed);
  } else if (motorNum == '2') {
    setMotorSpeed(enableB, motorB1, motorB2, speed);
    Serial.print("Motor Set 2 speed: ");
    Serial.println(speed);
  } else {
    Serial.println("Unknown motor number (use M1 or M2).");
  }
}

// ---- Set motor speed and direction ----
// speed: -1.0 (full reverse) to 1.0 (full forward)
void setMotorSpeed(int enablePin, int dir1Pin, int dir2Pin, float speed) {
  int pwmValue = (int)(abs(speed) * 255);

  if (speed > 0) {
    // Forward
    digitalWrite(dir1Pin, HIGH);
    digitalWrite(dir2Pin, LOW);
  } else if (speed < 0) {
    // Reverse
    digitalWrite(dir1Pin, LOW);
    digitalWrite(dir2Pin, HIGH);
  } else {
    // Stop
    digitalWrite(dir1Pin, LOW);
    digitalWrite(dir2Pin, LOW);
  }

  analogWrite(enablePin, pwmValue);
}

// ---- Stop all motors ----
void stopMotors() {
  digitalWrite(motorA1, LOW);
  digitalWrite(motorA2, LOW);
  digitalWrite(motorB1, LOW);
  digitalWrite(motorB2, LOW);
  digitalWrite(enableA, LOW);
  digitalWrite(enableB, LOW);
}
