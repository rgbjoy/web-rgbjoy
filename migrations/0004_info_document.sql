-- Existing copy is converted losslessly to a Lexical document on read.
ALTER TABLE site_info ADD COLUMN body TEXT;
