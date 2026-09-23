importScripts('vendor/xlsx.full.min.js');
self.onmessage=({data})=>{
  try{
    const workbook=XLSX.read(data.buffer,{type:'array',cellDates:false,cellFormula:true,sheetRows:3002});
    const sheets=[];
    for(const name of workbook.SheetNames){
      const sheet=workbook.Sheets[name];
      const fullRange=sheet['!fullref']||sheet['!ref'];
      if(fullRange&&XLSX.utils.decode_range(fullRange).e.r>3000)throw Error(`${name}: worksheet extends beyond 3,000 data rows. Trim unused rows or split the sheet.`);
      for(const [key,cell] of Object.entries(sheet)){if(!key.startsWith('!')&&cell.f)throw Error(`Formula in ${name}!${key}. Import values only.`);}
      const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false,dateNF:'yyyy-mm-dd'});
      if(rows.length>3000)throw Error('Each worksheet is limited to 3,000 rows.');
      if(rows.length)sheets.push({name,rows});
    }
    if(!sheets.length)throw Error('No data rows found.');
    self.postMessage({sheets});
  }catch(e){self.postMessage({error:e.message});}
};
