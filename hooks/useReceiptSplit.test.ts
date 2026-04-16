/**
 * Manual test documentation for BUG-API-2
 *
 * Jest is NOT configured for this project (no jest.config.js at project root,
 * no "test" script in package.json). The tests below are written in jest
 * syntax for future use once jest is set up, but cannot be executed with
 * `npm test` today.
 *
 * HOW TO MANUALLY VERIFY THE FIX:
 *
 * 1. Launch the app against a staging API or a local server you can intercept.
 * 2. Upload a receipt and proceed to the Assign step.
 * 3. Assign items to people normally.
 * 4. Before tapping "View Summary", configure your interceptor (e.g. Charles,
 *    mitmproxy, or a mock server) to return HTTP 500 with body:
 *      { "error": "Server error" }
 *    for POST /api/receipt/:id/assign.
 * 5. Tap "View Summary".
 * Expected: An alert dialog appears with title "Save Failed" and message
 *   "Server error". The app stays on the Assign step — it does NOT advance to
 *   the Summary step.
 * NOT expected (old behaviour): The app silently advances to Summary showing
 *   stale/unsaved data.
 *
 * --------------------------------------------------------------------------
 * Jest tests (requires jest + @testing-library/react-hooks or equivalent)
 * --------------------------------------------------------------------------
 */

// import { renderHook, act } from "@testing-library/react-hooks";
// import { useReceiptSplit } from "./useReceiptSplit";
//
// describe("useReceiptSplit — saveAssignments", () => {
//   it("throws when the API returns a non-ok response", async () => {
//     const mockApiFetch = jest.fn().mockResolvedValue({
//       ok: false,
//       json: () => Promise.resolve({ error: "Server error" }),
//     });
//
//     const { result } = renderHook(() => useReceiptSplit(mockApiFetch));
//
//     // Seed a receiptId so the early-return guard is bypassed.
//     // useReceiptSplit exposes receiptId only through the uploadReceipt flow,
//     // so we inject it via a successful upload mock first.
//     const uploadMock = jest.fn().mockResolvedValue({
//       ok: true,
//       json: () =>
//         Promise.resolve({
//           id: "receipt-123",
//           receipt_items: [],
//           subtotal: 0,
//           tax: 0,
//           tip: 0,
//           extras: [],
//           total: 0,
//           merchant_name: "Test",
//         }),
//     });
//
//     // Temporarily swap to the upload mock, run upload, then restore.
//     mockApiFetch.mockResolvedValueOnce(await uploadMock());
//     await act(async () => {
//       await result.current.uploadReceipt("file://test.jpg");
//     });
//
//     // Now saveAssignments should throw because mockApiFetch is back to 500.
//     await expect(
//       act(async () => {
//         await result.current.saveAssignments();
//       })
//     ).rejects.toThrow("Server error");
//   });
//
//   it("resolves normally when the API returns ok:true", async () => {
//     const mockApiFetch = jest.fn().mockResolvedValue({
//       ok: true,
//       json: () => Promise.resolve({}),
//     });
//
//     const { result } = renderHook(() => useReceiptSplit(mockApiFetch));
//
//     // Seed receiptId via upload.
//     const uploadResponse = {
//       ok: true,
//       json: () =>
//         Promise.resolve({
//           id: "receipt-456",
//           receipt_items: [],
//           subtotal: 0,
//           tax: 0,
//           tip: 0,
//           extras: [],
//           total: 0,
//           merchant_name: "Test",
//         }),
//     };
//     mockApiFetch.mockResolvedValueOnce(uploadResponse);
//     await act(async () => {
//       await result.current.uploadReceipt("file://test.jpg");
//     });
//
//     // saveAssignments should resolve without throwing.
//     await expect(
//       act(async () => {
//         await result.current.saveAssignments();
//       })
//     ).resolves.toBeUndefined();
//   });
// });
