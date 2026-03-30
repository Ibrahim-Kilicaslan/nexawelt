/* eslint-disable no-console */
const AWS = require("aws-sdk");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function sanitize(s) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, 5000);
}

exports.handler = async (event) => {
  try {
    const region = process.env.REGION || process.env.AWS_REGION || "us-east-1";
    const toEmail = process.env.TO_EMAIL;
    const fromEmail = process.env.FROM_EMAIL;

    if (!toEmail || !fromEmail) {
      return json(500, { ok: false, error: "Server is not configured." });
    }

    const rawBody = event && event.body ? event.body : "{}";
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body." });
    }

    const firstName = sanitize(payload.firstName);
    const lastName = sanitize(payload.lastName);
    const email = sanitize(payload.email);
    const subject = sanitize(payload.subject);
    const message = sanitize(payload.message);

    if (!email || !subject || !message) {
      return json(400, { ok: false, error: "Missing required fields." });
    }

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const bodyText = [
      fullName ? `Name: ${fullName}` : null,
      `E-Mail: ${email}`,
      "",
      message,
    ]
      .filter((x) => x !== null)
      .join("\n");

    const ses = new AWS.SES({ region });

    await ses
      .sendEmail({
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Charset: "UTF-8", Data: subject },
          Body: { Text: { Charset: "UTF-8", Data: bodyText } },
        },
        Source: fromEmail,
        ReplyToAddresses: [email],
      })
      .promise();

    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: "Failed to send email." });
  }
};

