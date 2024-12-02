const Excel = require("exceljs");
const ifsc = require("ifsc");
const readline = require("readline");
const fs = require("fs");
const axios = require("axios");

let bankData = [];
try {
  // Corrected parsing logic
  bankData = JSON.parse(fs.readFileSync("bank_data.json", "utf-8"));
} catch (error) {
  console.error("Failed to load external JSON file:", error.message);
}

const workbook = new Excel.Workbook();
const bank_list = {}; // Stores valid bank details by IFSC code
const valid_list = {}; // Stores validation results for IFSC codes

// Function to process the Excel file
async function processExcelFile() {
  try {
    console.log("Reading Excel file...");
    await workbook.xlsx.readFile("sample.xlsx");
    const worksheet = workbook.getWorksheet(1);
    const total = worksheet.rowCount;
    let count = 0,
      valid = 0,
      bar = "█";

    for (let i = 1; i <= total; i++) {
      const row = worksheet.getRow(i);
      const code = row.getCell(1).value;

      if (!(code in valid_list)) valid_list[code] = ifsc.validate(code);

      if (valid_list[code]) {
        if (!(code in bank_list))
          bank_list[code] = await ifsc.fetchDetails(code);

        const details = bank_list[code];
        row.getCell(2).value = details.BANK;
        row.getCell(3).value = details.BRANCH;
        valid++;
      } else {
        row.getCell(2).value = "Invalid IFSC";
        row.getCell(2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0000" },
        };
      }
      count++;
      if (count % 20 === 0) bar += "█";
      console.clear();
      console.log(`\n${bar} \nProcessed ${count} out of ${total}`);
    }

    console.log(`\nValid: ${valid}\nInvalid: ${total - valid}`);
    console.log("\nProcessing completed. Writing results to output file...");

    await workbook.xlsx.writeFile("output.xlsx");
    console.log("File saved as output.xlsx.");

    promptUserOptions();
  } catch (error) {
    console.error("Error processing the Excel file:", error.message);
  }
}

// Function to create a new readline interface
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Function to prompt the user for options
function promptUserOptions() {
  const rl = createReadline();

  console.log("\nSelect an option:");
  console.log("1. Manually enter an IFSC code and add details to output.xlsx");
  console.log("2. Enter region or branch name to fetch bank details");
  console.log("3. View history from output.xlsx");

  rl.question("Enter your choice (1/2/3): ", async (choice) => {
    rl.close(); // Close readline interface immediately
    switch (choice) {
      case "1":
        await manuallyEnterIFSC();
        break;
      case "2":
        promptRegionOrBranchInput();
        break;
      case "3":
        await viewHistoryFromExcel();
        break;
      default:
        console.log("Invalid choice. Please try again.");
        promptUserOptions();
        break;
    }
  });
}

// Function to manually enter an IFSC code
async function manuallyEnterIFSC() {
  const rl = createReadline();

  rl.question("\nEnter the IFSC code to validate: ", async (code) => {
    rl.close();

    if (!ifsc.validate(code)) {
      console.log("Invalid IFSC code.");
      promptUserOptions();
      return;
    }

    try {
      const details = await ifsc.fetchDetails(code);
      const worksheet = workbook.getWorksheet(1);
      const lastRow = worksheet.lastRow.number + 1;
      const newRow = worksheet.getRow(lastRow);

      newRow.getCell(1).value = code;
      newRow.getCell(2).value = details.BANK;
      newRow.getCell(3).value = details.BRANCH;
      await workbook.xlsx.writeFile("output.xlsx");

      console.log("IFSC details added to output.xlsx.");
    } catch (error) {
      console.error("Error fetching details for the IFSC code:", error.message);
    }
    promptUserOptions();
  });
}

// Function to prompt for region or branch input
function promptRegionOrBranchInput() {
  const rl = createReadline();

  rl.question(
    "\nEnter the region or branch name to fetch bank details: ",
    async (searchTerm) => {
      rl.close();

      if (!searchTerm || searchTerm.trim() === "") {
        console.log("No region or branch name provided. Please try again.");
        promptRegionOrBranchInput();
      } else {
        searchBankDetails(searchTerm.trim().toLowerCase());
        promptUserOptions();
      }
    }
  );
}

// Function to search bank details by region or branch name
function searchBankDetails(regionOrBranch) {
  let results = [];

  // Search in the JSON data
  bankData.forEach((entry) => {
    // Check if entry has a 'BANK' field and ensure it's a string before calling toLowerCase
    if (entry.REGION && entry.REGION.toLowerCase().includes(regionOrBranch)) {
      results.push(entry);
    }

    // If "BANKS" exists, loop through the branches
    if (entry.BANKS) {
      entry.BANKS.forEach((bankEntry) => {
        bankEntry.BRANCHES.forEach((branch) => {
          if (
            (branch.BRANCH_NAME &&
              branch.BRANCH_NAME.toLowerCase().includes(regionOrBranch)) ||
            (entry.BANK && entry.BANK.toLowerCase().includes(regionOrBranch))
          ) {
            results.push({
              BANK: bankEntry.BANK,
              BRANCH_NAME: branch.BRANCH_NAME,
              IFSC_CODE: branch.IFSC_CODE,
              ADDRESS: branch.ADDRESS,
              CONTACT: branch.CONTACT,
            });
          }
        });
      });
    }
  });

  // Output the results
  if (results.length > 0) {
    console.log(`Found the following banks for '${regionOrBranch}':`);
    results.forEach((result) => {
      console.log(`
        Bank: ${result.BANK || "N/A"}
        Branch: ${result.BRANCH_NAME || "N/A"}
        IFSC Code: ${result.IFSC_CODE || "N/A"}
        Address: ${result.ADDRESS || "N/A"}
        Contact: ${result.CONTACT || "N/A"}
      `);
    });
  } else {
    console.log(`No banks found for '${regionOrBranch}'.`);
  }
}

// Function to view history from output.xlsx
async function viewHistoryFromExcel() {
  try {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile("output.xlsx");
    const worksheet = workbook.getWorksheet(1);

    console.log("\nIFSC Code History:");
    worksheet.eachRow((row, rowNumber) => {
      console.log(
        `Row ${rowNumber}: IFSC=${row.getCell(1).value}, Bank=${
          row.getCell(2).value
        }, Branch=${row.getCell(3).value}`
      );
    });
  } catch (error) {
    console.error("Error reading history from output.xlsx:", error.message);
  }
  promptUserOptions();
}

// Start the process
processExcelFile();
