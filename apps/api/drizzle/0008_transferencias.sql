ALTER TABLE "stock_movements" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
CREATE INDEX "stock_movements_transfer_idx" ON "stock_movements" USING btree ("transfer_id");