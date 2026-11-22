import { createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSnsCertUrl, snsStringToSign, spkiFromCert, verifySns, type SnsSigned } from "../src/lib/mail/sns";

// A throwaway self-signed certificate made for this test only (openssl req -x509), standing in for SNS's.
const CERT = `-----BEGIN CERTIFICATE-----
MIIC6DCCAdCgAwIBAgIUFsArGyRYjtLRJvou+JA/uDvu5HUwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIc25zLnRlc3QwIBcNMjYxMTE3MTkzNDA1WhgPMjEyNjEw
MjQxOTM0MDVaMBMxETAPBgNVBAMMCHNucy50ZXN0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAp4h0nCaLsZUkO8UswfvZIGVlQCZ5ShT8RP7z6glqPZHo
4Uqq4YqWVHvJrUYX2h/HyAPI2XfrpUZ4HFP+Kqmr2OuGNMwO/vEMlrsX1U9kZ5JQ
RYTThcHwCqh9cR+EfdDZuhLqQFHquGUmrJB1Frx1SjdqGnEHV0tgq4SwXDCc3dp0
P9kx9HnGCwHxJaFmse3qG7O9LZcggja3AaJc0yMvZnkoqYBUai677jSKiSgWpL6R
PDPFKRewvptiicXwg/AW5jfZi/Nt69mhTL1slaTdM1C/wXtgwicAax+WOQQFWVBW
W7vzY9ozvhldYqgs2v76/QNaCN2fLHUVuYU+PhzFbwIDAQABozIwMDAdBgNVHQ4E
FgQUe4pfTHtmwiwJcuOv3/7LHdBb5bswDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG
9w0BAQsFAAOCAQEAhLUyPFoxoSG+ma2Qli7Vr7LYG1K7CvGP8xLeZIRLvSYxOEDn
PJdaHvTSdV5mLQ3oghQHd2Sh9TGx1kxl26r6aYXkvKB6GePIpFBG2AEEKtgWCNeR
FstTq6fpl3ZlQm/XRL3JupdgelWuwgEybSTYHMAeVsqU0+WOGu5kANUDpwg5hZHP
hjo4g5TzL/JOXPUsbLmdeP9qFvBNaqHr3DX+dlqB8sBgrlBh88bQxT0y2hiHNqWv
d81X1Sokr+bgOYq3BTSRVJLOz3+8xdXZ357LEf2bXbX19quQIytDG3Pn+6lzKRbg
gr7jIzE5AOe9oL8oXpWrjLWVZCiypf0EirJIUg==
-----END CERTIFICATE-----`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCniHScJouxlSQ7
xSzB+9kgZWVAJnlKFPxE/vPqCWo9kejhSqrhipZUe8mtRhfaH8fIA8jZd+ulRngc
U/4qqavY64Y0zA7+8QyWuxfVT2RnklBFhNOFwfAKqH1xH4R90Nm6EupAUeq4ZSas
kHUWvHVKN2oacQdXS2CrhLBcMJzd2nQ/2TH0ecYLAfEloWax7eobs70tlyCCNrcB
olzTIy9meSipgFRqLrvuNIqJKBakvpE8M8UpF7C+m2KJxfCD8BbmN9mL823r2aFM
vWyVpN0zUL/Be2DCJwBrH5Y5BAVZUFZbu/Nj2jO+GV1iqCza/vr9A1oI3Z8sdRW5
hT4+HMVvAgMBAAECggEADSdMDISEPEWa6ixxdquI4R/E4tQCetwJ8HrZ+LqTglEF
6UZdA0dHxUtQys9xiPkszNnrN5PQRxIw1PyNPJlEukvHpjaNSNvxIpZ+6QsKNY2J
yuOCXgKbj6Kp8qtIUj6HEbJxfOpRlPewISVYZBgY12JhbMEKFAMBjIXm+N4COvLO
zl4LHn/5plpAXzKEeq9/SqUlXt1n4UYPCCfITSrxksar9ypaZdp9SwRcO/kSt3P8
jT2MIrXq7ItDD7VkgsJDnxX5+exKDQyAazV+VDccTMYjESXORGoIoYa8vo9l3b0x
x7VHOIbH2SWraEkCtt/fco0HH4/EJKgt8+2eIZBdaQKBgQDc5Lkzhg/x1m+2Trb7
G7zIUSxYcgfNRFsEs6DXnf7HK2FG/PKIm6qt66pGO1i0Vo2Nzih7A5j0K74DhqWk
HNkw5b/ZoycnMptOybe84NEVI1VaDLmB/0LONHPEuJ/GMDzIBt+q5W7UtCObKoPo
Vyde8sz8HAmFRBo27Bxs8cPP6QKBgQDCKLVmgsHiBSmKPyCRFvoIVfZqLhNhVmOa
tiWEqayw+4XMCjixGreKfViG59PgjOTeDf4WKt2bfYliWNn812QxyCtUEfrFYDvv
ka24+Ym/2+tijrpi/eHuH+qEfsR+/FiccOr2r5/Q+Z2R9j+7GukU15DbhSaBa8Jm
MpoYHIkrlwKBgFmji7Bn7+KA1ZaSvNiL+gEER82ggKAA5Dq1NkkpeXGTngczsKxV
F186qj+T57xO/2STS4QYAqLbeWFu65r8hfq80Szdc48Jj1LasvA3/0DntMQ1M7aY
QqDxUiV7koLXomK9v1hXgLFaZLSb/Sl07KowN5T7P7XP3B97k1F2jrK5AoGBAKRY
tQPqlpbs67abrMNjgY1gxk4mZj00VOd2WteqkATXQu/tjwNKrCXL6A15Wn1uhaP4
kCTPb/nYD1xx/ULqR2NkHljxRyWfSdyFoVk70H/YdaxdSCPW51EbLvWsIEOk8pSp
eBoLmunXAKu2l0eXhcggl/tY/7j5L/o1xv212d5NAoGBAIuGoOialf7Xc9s51yCF
FkUHUaYUXNC7BWjtkV7FhNcKlECkYe8zwE7YoDPeVJ0ubpxw/wC2q39280PTdgcc
j8Cc5S5jWKhJn4p00+bxperWxEt4MYcqjXjdYOq6eAoCPywKMF5RSvVjR+sDaDGA
Bz9DP/jHRP+TCSEur9o72kO0
-----END PRIVATE KEY-----`;

const sign = (m: SnsSigned, alg: "sha1" | "sha256") => createSign(alg).update(snsStringToSign(m)).sign(KEY, "base64");
const note: SnsSigned = {
  Type: "Notification",
  MessageId: "m-1",
  TopicArn: "arn:aws:sns:eu-west-1:123456789012:workinbox-inbound",
  Message: '{"notificationType":"Received"}',
  Timestamp: "2026-11-17T10:00:00.000Z",
};

describe("SNS signatures", () => {
  it("builds the string SNS signs, leaving out absent keys", () => {
    expect(snsStringToSign(note)).toBe(`Message\n${note.Message}\nMessageId\nm-1\nTimestamp\n${note.Timestamp}\nTopicArn\n${note.TopicArn}\nType\nNotification\n`);
    expect(snsStringToSign({ Type: "SubscriptionConfirmation", Token: "t", SubscribeURL: "u" })).toBe("SubscribeURL\nu\nToken\nt\nType\nSubscriptionConfirmation\n");
  });

  it("verifies version 1 (SHA1) and 2 (SHA256) signatures and rejects tampering", async () => {
    for (const [v, alg] of [["1", "sha1"], ["2", "sha256"]] as const) {
      const signed = { ...note, SignatureVersion: v, Signature: sign(note, alg) };
      expect(await verifySns(signed, CERT)).toBe(true);
      expect(await verifySns({ ...signed, Message: '{"notificationType":"Bounce"}' }, CERT)).toBe(false);
      expect(await verifySns({ ...signed, SignatureVersion: "3" }, CERT)).toBe(false);
    }
    expect(await verifySns({ ...note, SignatureVersion: "2" }, CERT)).toBe(false);
    expect(await verifySns({ ...note, SignatureVersion: "2", Signature: sign(note, "sha256") }, "not a cert")).toBe(false);
  });

  it("finds the public key in a certificate", () => {
    const der = Uint8Array.from(atob(CERT.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
    expect(spkiFromCert(der)[0]).toBe(0x30);
  });

  it("only trusts Amazon's SNS hosts for certificates", () => {
    expect(isSnsCertUrl("https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc.pem")).toBe(true);
    expect(isSnsCertUrl("http://sns.eu-west-1.amazonaws.com/x.pem")).toBe(false);
    expect(isSnsCertUrl("https://sns.eu-west-1.amazonaws.com.evil.com/x.pem")).toBe(false);
    expect(isSnsCertUrl("https://evil.com/sns.eu-west-1.amazonaws.com/x.pem")).toBe(false);
    expect(isSnsCertUrl(undefined)).toBe(false);
  });
});
