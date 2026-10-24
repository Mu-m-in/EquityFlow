const ChargesTable = ({ title, headers, rows, note, footer }) => {

  return (

    <div className="max-w-6xl mx-auto px-8 py-14">

      {/* Title */}

      <h2 className="text-2xl font-medium text-gray-700 mb-8">

        {title}

      </h2>



      {/* Optional Note */}

      {note && (

        <p className="mb-6 text-gray-600 text-lg">{note}</p>

      )}



      {/* Table */}

      <div className="overflow-x-auto border border-gray-200 rounded-sm">

        <table className="w-full border-collapse">



          {/* Header */}

          <thead>

            <tr className="border-b border-gray-200">

              {headers.map((header, i) => (

                <th

                  key={i}

                  className="text-left px-6 py-5 text-md font-medium"

                >

                  {header}

                </th>

              ))}

            </tr>

          </thead>



          {/* Body */}

          <tbody>

            {rows.map((row, index) => (

              <tr key={index} className="border-b border-gray-100">



                {/* First column */}

                <td className="px-6 py-6 text-gray-700 text-sm">

                  {row.type}

                </td>



                {/* Second column */}

                <td className="px-6 py-6 text-gray-700 text-sm">

                  {row.free ? (

                    row.charge.includes("(") ? (

                      <>

                        <span className="bg-green-600 text-white text-sm px-3 py-1 rounded">

                          FREE

                        </span>

                        <span className="ml-2">

                          {row.charge.replace("FREE", "")}

                        </span>

                      </>

                    ) : (

                      <span className="bg-green-600 text-white text-sm px-3 py-1 rounded">

                        {row.charge}

                      </span>

                    )

                  ) : (

                    row.charge

                  )}

                </td>



              </tr>

            ))}

          </tbody>

        </table>

      </div>



      {/* Footer */}

      {footer && (

        <div className="mt-6 text-gray-600 text-base leading-8">

          {footer}

        </div>

      )}

    </div>

  );

};



export default ChargesTable;
