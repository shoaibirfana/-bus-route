# Bus Ticket Counter

A simple website for the cash-counter staff of a bus company. Fill in the
passenger and trip details, and it makes a printable **PDF ticket** to hand to
the customer.

## Features

- **Passenger details** – name, phone, email (Gmail), ID/CNIC, gender,
  number of passengers, seat numbers, emergency contact.
- **Journey** – from / to, departure date and time, bus number, bus class.
- **Stops** – add as many stops as you want (with an optional time for each),
  reorder them with ↑ / ↓, or remove them.
- **Round trip** – tick *Round trip* to add a return date, return time and
  return bus. The return route shows the same stops in reverse order.
- **Price** – you type the fare per seat (and return fare). Extra charges and
  discount are supported; the total is calculated automatically.
- **PDF ticket** – one click downloads a ticket with a unique ticket number
  (e.g. `TKT-260930-0001`), all details, the route with stops, fare breakdown,
  payment method, staff name, and your terms & conditions.
- **Ticket history** – search old tickets, download the PDF again, or
  "Re-use" a ticket to fill the form for a regular customer / same route.
- **Settings** – company name, phone, address, currency symbol (default `Rs`),
  ticket number prefix, saved city list (suggestions while typing), and terms.

## How to use

No installation or internet needed. Just open `index.html` in Chrome, Edge or
Firefox on the counter computer (double-click it). To put it online, upload the
whole folder to any static host (GitHub Pages, Netlify, etc.).

1. Open **Settings** once and enter your company details, then *Save*.
2. On **New Ticket** fill the form and click **Generate Ticket PDF**.
3. Print the PDF or send it to the customer (WhatsApp / email).

> Ticket history and settings are saved in the browser of that computer only.
> Clearing browser data will remove them.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page (form, history, settings) |
| `style.css` | Styling |
| `app.js` | Form logic, totals, history and PDF layout |
| `lib/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (MIT) for making PDFs, kept locally so it works offline |
