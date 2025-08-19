const nodemailer = require("nodemailer");

// Create a transporter
const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: "joerinijs19@gmail.com", // your Gmail address
		pass: "sdih giov wilj nwco", // use an App Password (not your Gmail password)
	},
});

// Set up email data
const mailOptions = {
	from: "joerinijs19@gmail.com",
	to: "joerinijs@hotmail.com",
	subject: "Hello from Node.js!",
	text: "This is a test email sent from a Node.js app.",
};

// Send the email
transporter.sendMail(mailOptions, (error, info) => {
	if (error) {
		return console.log("Error sending email:", error);
	}
	console.log("Email sent:", info.response);
});
